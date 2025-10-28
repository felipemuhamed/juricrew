from crewai.tools import BaseTool
from pydantic import BaseModel, Field, PrivateAttr
from typing import Optional, Type
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse, urljoin
import os, time, re, json

class ExploreFrontendInput(BaseModel):
    url: str = Field(..., description="Frontend application base URL to explore")
    username: str = Field(..., description="Username to login")
    password: str = Field(..., description="password to login")

    max_depth: Optional[int] = Field(2, description="Maximum navigation depth")
    wait_time: Optional[float] = Field(1.5, description="Seconds to wait after navigation")
    screenshot_dir: Optional[str] = Field(None, description="Folder to save screenshots")
    save_html: Optional[bool] = Field(False, description="Whether to save rendered HTML of each page")
    selectors: Optional[dict] = Field(None, description="Pre-configured selectors for UI elements, keyed by type")
    framework: Optional[str] = Field(None, description="Frontend framework name")

class ExploreFrontendTool(BaseTool):
    name: str = "SPA Frontend Explorer"
    description: str = (
        "Explores SPA frontends like a QA agent, with specific support for Angular Material "
        "components (mat-select, mat-dialog, mat-tab, mat-expansion-panel, mat-snack-bar). "
        "Detects login screens, forms, buttons, modals, tabs, navigation links, tables, alerts, "
        "and dynamic UI elements. Maps navigation flows and captures screenshots and HTML if requested."
    )
    args_schema: Type[BaseModel] = ExploreFrontendInput
    _visited: set = PrivateAttr()
    _pages_data: list = PrivateAttr()
    _nav_map: dict = PrivateAttr()
    _base_domain: str = PrivateAttr()
    _login_info: dict = PrivateAttr(default=None)
    _selectors: dict = PrivateAttr()
    _framework: str = PrivateAttr()

    def __init__(self):
        super().__init__()
        self._visited = set()
        self._pages_data = []
        self._nav_map = {}

    def _run(self, url: str , username, password, max_depth: int = 2, wait_time: float = 1.5,
            screenshot_dir: Optional[str] = None, save_html: bool = False,
            selectors: Optional[dict] = None, framework: Optional[str] = None) -> dict:

        parsed_base = urlparse(url)
        self._base_domain = f"{parsed_base.scheme}://{parsed_base.netloc}"
        self._framework = framework or "generic"
        
        # Always use framework-specific selectors as base
        self._selectors = self._get_framework_selectors(self._framework)
        
        # Merge with any provided selectors (if not None)
        if selectors is not None:
            self._selectors.update(selectors)

        if screenshot_dir:
            os.makedirs(screenshot_dir, exist_ok=True)

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            self._explore_route(page, url, 0, max_depth, wait_time, screenshot_dir, save_html, username, password)

            browser.close()

        return {
            "pages": self._pages_data,
            # "navigation_map": self._nav_map,
            "login_info": self._login_info,
            # "framework": self._framework
        }

    def _get_framework_selectors(self, framework):
        """Return framework-specific selectors"""
        selectors = {
            "generic": {
                "button": ["button", "[role='button']"],
                "link": ["a[href]", "[routerLink]"],
                "input": ["input:not([type='hidden'])", "textarea"],
                "select": ["select", "[role='combobox']"],
                "checkbox": ["input[type='checkbox']"],
                "radio": ["input[type='radio']"],
                "form": ["form"],
                "modal": ["[role='dialog']"],
                "tab": ["[role='tab']"],
                "accordion": [".accordion-button"],
                "navigation": ["a[href]", "[routerLink]"],
                "table": ["table"],
                "alert": [".alert", "[role='alert']"],
                "login": {
                    "username": "input[name='username'], input[type='email']",
                    "password": "input[type='password']",
                    "submit": "button[type='submit']"
                }
            },
            "angular-material": {
                "button": ["button", ".mat-button", ".mat-raised-button", ".mat-icon-button"],
                "link": ["a[href]", "[routerLink]"],
                "input": [".mat-input-element", "input:not([type='hidden'])", "textarea"],
                "select": [".mat-select"],
                "checkbox": [".mat-checkbox"],
                "radio": [".mat-radio-button"],
                "form": ["form"],
                "modal": [".mat-dialog-container"],
                "tab": [".mat-tab-label"],
                "accordion": [".mat-expansion-panel"],
                "navigation": ["a[href]", "[routerLink]", ".mat-nav-list a"],
                "table": [".mat-table"],
                "alert": [".mat-snack-bar-container", ".mat-simple-snackbar"],
                "login": {
                    "username": "input[name='username'], input[type='email']",
                    "password": "input[type='password']",
                    "submit": "button[type='submit'], .mat-button"
                }
            },
            "bootstrap": {
                "button": ["button", ".btn"],
                "link": ["a[href]"],
                "input": ["input:not([type='hidden'])", "textarea", ".form-control"],
                "select": ["select", ".form-select"],
                "checkbox": [".form-check-input"],
                "radio": [".form-check-input[type='radio']"],
                "form": ["form"],
                "modal": [".modal"],
                "tab": [".nav-link"],
                "accordion": [".accordion-button"],
                "navigation": ["a[href]", ".navbar-nav a", ".nav-link"],
                "table": [".table"],
                "alert": [".alert"],
                "login": {
                    "username": "input[name='username'], input[type='email']",
                    "password": "input[type='password']",
                    "submit": "button[type='submit'], .btn"
                }
            },
            "primeng": {
                "button": ["button", ".p-button"],
                "link": ["a[href]"],
                "input": ["input:not([type='hidden'])", "textarea", ".p-inputtext"],
                "select": [".p-dropdown"],
                "checkbox": [".p-checkbox"],
                "radio": [".p-radiobutton"],
                "form": ["form"],
                "modal": [".p-dialog"],
                "tab": [".p-tabview-nav-link"],
                "accordion": [".p-accordion-header"],
                "navigation": ["a[href]", ".p-menuitem-link"],
                "table": [".p-datatable"],
                "alert": [".p-message"],
                "login": {
                    "username": "input[name='username'], input[type='email']",
                    "password": "input[type='password']",
                    "submit": "button[type='submit'], .p-button"
                }
            }
        }
        
        return selectors.get(framework.lower() if framework else "generic", selectors["generic"])

    def _explore_route(self, page, url, depth, max_depth, wait_time, screenshot_dir, save_html, username, password):
        if depth > max_depth or url in self._visited:
            return

        self._visited.add(url)
        
        try:
            page.goto(url, wait_until="domcontentloaded")
            time.sleep(wait_time)
        except Exception as e:
            print(f"Error navigating to {url}: {e}")
            return

        # Handle login if detected
        self._handle_login(page, wait_time, username, password)

        # Capture screenshot and HTML
        route_name = re.sub(r'[^a-zA-Z0-9_]', '_', url.replace(self._base_domain, "") or "home")
        screenshot_path, html_path = None, None

        if screenshot_dir:
            screenshot_path = os.path.join(screenshot_dir, f"{route_name}.png")
            try:
                page.screenshot(path=screenshot_path, full_page=True)
            except Exception as e:
                print(f"Error taking screenshot: {e}")
                screenshot_path = None

        if save_html and screenshot_dir:
            html_path = os.path.join(screenshot_dir, f"{route_name}.html")
            try:
                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(page.content())
            except Exception as e:
                print(f"Error saving HTML: {e}")
                html_path = None

        # # Extract elements using provided selectors
        # elements = []
        # for el_type, selector_config in self._selectors.items():
        #     if el_type == 'login':
        #         continue  # Skip login selectors
                
        #     selectors = selector_config if isinstance(selector_config, list) else [selector_config]
            
        #     for selector in selectors:
        #         try:
        #             found_elements = page.query_selector_all(selector)
        #             for el in found_elements:
        #                 try:
        #                     # Skip hidden elements
        #                     if not self._is_element_visible(el):
        #                         continue
                                
        #                     text = el.evaluate('el => el.textContent || ""').strip()[:100]
        #                     unique_selector = self._get_best_selector(el)
                            
        #                     elements.append({
        #                         "type": el_type,
        #                         "selector": unique_selector,
        #                         "text": text,
        #                         "actions": self._get_actions_for_element(el_type, el),
        #                         "attributes": self._get_element_attributes(el),
        #                         "position": self._get_element_position(el)
        #                     })
        #                 except Exception as e:
        #                     print(f"Error processing element: {e}")
        #                     continue
        #         except Exception as e:
        #             print(f"Error querying selector {selector}: {e}")
        #             continue

        # Register page
        self._pages_data.append({
            "url": page.url,
            # "title": page.title(),
            # "elements": elements,
            # "screenshot_path": screenshot_path,
            # "html_path": html_path
        })

        # Navigation
        self._nav_map[url] = []
        nav_selectors = self._selectors.get('navigation', ["a[href]", "[routerLink]"])
        
        if not isinstance(nav_selectors, list):
            nav_selectors = [nav_selectors]
            
        for selector in nav_selectors:
            try:
                for link in page.query_selector_all(selector):
                    try:
                        href = link.get_attribute('href') or link.get_attribute('routerLink') or ""
                        if href and not href.startswith(('http', 'mailto:', 'tel:', '#')):
                            href = urljoin(self._base_domain, href)
                        if href and href.startswith(self._base_domain) and href not in self._visited:
                            self._nav_map[url].append({
                                "href": href,
                                "text": link.evaluate('el => el.textContent || ""').strip()[:50],
                                "selector": selector
                            })
                    except Exception as e:
                        print(f"Error processing navigation link: {e}")
                        continue
            except Exception as e:
                print(f"Error querying navigation selector {selector}: {e}")
                continue

        # Explore links recursively
        for next_url_info in self._nav_map[url]:
            with page.context.new_page() as new_page:
                self._explore_route(new_page, next_url_info["href"], depth + 1, max_depth, wait_time, screenshot_dir, save_html, username, password)

    def _handle_login(self, page, wait_time, username, password):
        if page.query_selector('input[name="username"]') and page.query_selector('input[name="password"]'):
            parsed_login = urlparse(page.url)
            self._login_info = {
                "login_detected": True,
                "login_page": page.url,
                "login_origin": f"{parsed_login.scheme}://{parsed_login.netloc}",
                "login_selectors": {
                    "username": "input[name='username']",
                    "password": "input[name='password']",
                    "submit": "input[type='submit'], button[type='submit'], button[name='login']"
                }
            }
            page.fill(self._login_info["login_selectors"]["username"], username)
            page.fill(self._login_info["login_selectors"]["password"], password)

            submit_button = page.query_selector(self._login_info["login_selectors"]["submit"])
            if submit_button:
                submit_button.click()
            else:
                raise RuntimeError("Nenhum botão de submit encontrado na tela de login.")

            page.wait_for_load_state("networkidle")
            time.sleep(wait_time)
            self._login_info["login_success"] = True

    def _is_element_visible(self, element):
        """Check if element is visible"""
        try:
            return element.evaluate('''el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && 
                       style.visibility !== 'hidden' && 
                       style.opacity !== '0' &&
                       el.offsetWidth > 0 && 
                       el.offsetHeight > 0;
            }''')
        except:
            return False

    def _get_best_selector(self, element):
        """Get the best unique selector for an element"""
        try:
            # Try ID first
            element_id = element.get_attribute('id')
            if element_id:
                return f"#{element_id}"
            
            # Try name
            name = element.get_attribute('name')
            if name:
                return f"[name='{name}']"
            
            # Try data-testid
            test_id = element.get_attribute('data-testid')
            if test_id:
                return f"[data-testid='{test_id}']"
            
            # Try aria-label
            aria_label = element.get_attribute('aria-label')
            if aria_label:
                return f"[aria-label='{aria_label}']"
            
            # Try class
            class_name = element.get_attribute('class')
            if class_name:
                classes = class_name.split()
                for cls in classes:
                    if cls and not cls.startswith('ng-'):
                        return f".{cls}"
            
            # Fallback to tag name
            tag_name = element.evaluate('el => el.tagName.toLowerCase()')
            return tag_name
            
        except:
            return "unknown"

    def _get_actions_for_element(self, el_type, element):
        """Determine possible actions for an element based on its type"""
        try:
            tag_name = element.evaluate('el => el.tagName.toLowerCase()')
            input_type = element.get_attribute('type')
            
            if tag_name == 'input' and input_type == 'checkbox':
                return ['check', 'uncheck', 'click']
            elif tag_name == 'input' and input_type == 'radio':
                return ['check', 'click']
            elif tag_name == 'input':
                return ['type', 'clear', 'fill']
            elif tag_name == 'textarea':
                return ['type', 'clear', 'fill']
            elif tag_name == 'select':
                return ['select_option', 'click']
            elif tag_name == 'button' or tag_name == 'a':
                return ['click']
            
            # Fallback based on element type
            actions_map = {
                'button': ['click'],
                'link': ['click'],
                'input': ['type', 'clear', 'fill'],
                'textarea': ['type', 'clear', 'fill'],
                'select': ['select_option', 'click'],
                'checkbox': ['check', 'uncheck', 'click'],
                'radio': ['check', 'click'],
                'form': ['submit'],
                'modal': ['close', 'accept', 'dismiss'],
                'tab': ['click', 'select'],
                'accordion': ['click', 'expand', 'collapse'],
                'navigation': ['click']
            }
            
            return actions_map.get(el_type, ['click'])
        except:
            return ['click']

    def _get_element_attributes(self, element):
        """Extract relevant attributes from an element"""
        attributes = {}
        try:
            for attr in ['id', 'name', 'class', 'type', 'placeholder', 'aria-label', 
                        'role', 'required', 'disabled', 'value', 'data-testid', 'href', 'routerLink']:
                value = element.get_attribute(attr)
                if value is not None:
                    attributes[attr] = value
        except:
            pass
        return attributes

    def _get_element_position(self, element):
        """Get element position and size"""
        try:
            box = element.bounding_box()
            if box:
                return {
                    'x': box['x'],
                    'y': box['y'],
                    'width': box['width'],
                    'height': box['height']
                }
        except:
            pass
        return None