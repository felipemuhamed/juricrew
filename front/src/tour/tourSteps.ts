export type TourStep = {
  /** Stable id for analytics/debugging */
  id: string;
  /** CSS selector for the element to highlight (recommended: [data-tour="..."]) */
  target: string;
  /** Short title shown at the top of the tour card */
  title: string;
  /** Body copy shown under the title */
  content: string;
  /** If true, step is skipped automatically when the target isn't found */
  optional?: boolean;
  /** Called before attempting to resolve the target (e.g., click a button to reveal the next screen) */
  beforeResolveTarget?: () => void | Promise<void>;
  /**
   * If set, the "Next" button is disabled until this selector exists.
   * Useful when the step depends on async content loading.
   */
  blockNextUntilSelector?: string;
};

/**
 * Motion creation tour:
 *  - Motion details (Step 1)
 *  - Template selection + authority selection (Step 2)
 *  - Generate motion
 */
export const motionCreationTourSteps: TourStep[] = [
  {
    id: "nav-templates",
    target: '[data-tour="nav-templates"]',
    title: "Templates live here",
    content:
      "Templates define the sections and wording used in your final motion. You can create or edit templates at any time from this menu.",
  },
  {
    id: "step1-motion-type",
    target: '[data-tour="motion-type"]',
    title: "Start with the motion details",
    content:
      "Enter the motion type (example: Motion to Compel Further Responses to Requests for Production).",
  },
  {
    id: "step1-facts",
    target: '[data-tour="facts"]',
    title: "Add the key facts",
    content:
      "Paste or type the facts the court needs. The AI will use these facts to draft the Introduction, Facts, and Argument sections.",
  },
  {
    id: "step1-case-number",
    target: '[data-tour="case-number"]',
    title: "Case identifiers",
    content:
      "Add the case number and court. Placeholders like hearing date/time/dept are filled later by staff.",
  },
  {
    id: "step1-find-authorities",
    target: '[data-tour="btn-find-authorities"]',
    title: "Find authorities (optional but recommended)",
    content:
      "Click \"Find authorities\" to research potential statutes, rules, and cases. When results finish loading, they will appear in Step 2.",
  },
  {
    id: "step1-skip",
    target: '[data-tour="btn-skip-to-template"]',
    title: "Go to template + authority selection",
    content:
      "You can skip research for now and jump straight to template selection. You can always re-run research later.",
  },
  {
    id: "step2-template",
    target: '[data-tour="template-select"]',
    title: "Select a template",
    content:
      "Choose the template that matches your motion. A template is required to generate the motion.",
    beforeResolveTarget: () => {
      // If the user is still on Step 1, click the Skip button to reveal Step 2.
      const skip = document.querySelector('[data-tour="btn-skip-to-template"]') as HTMLElement | null;
      skip?.click?.();

      // During the tour, load mock research results so Step 2 feels like a real authorities search.
      // The PleadingComposer listens for this event and will populate authorities + selection UI.
      try {
        window.dispatchEvent(new CustomEvent("juricrew:tour:loadMockAuthorities"));
      } catch {
        // ignore
      }
    },
  },
  {
    id: "step2-create-template",
    target: '[data-tour="btn-create-template"]',
    title: "Create or edit a template (if needed)",
    content:
      "If you don't have a template yet, click Create to open the template wizard. You can start the Template Builder Tour from the help icon at the top of that wizard.",
  },
  {
    id: "step2-authorities",
    target: '[data-tour="authorities-section"]',
    title: "Select authorities",
    content:
      "Important: ONLY the authorities you select here will be included. If it isn't selected/highlighted, it will not be used in the generated motion.",
  },
  {
    id: "step2-authority-item",
    target: '[data-tour="authority-item-0"]',
    title: "Select the authorities you want used",
    content:
      "Select the specific cases/statutes/rules you want included. Unselected authorities are excluded.",
    optional: true,
  },
  {
    id: "step2-generate",
    target: '[data-tour="btn-generate-motion"]',
    title: "Generate the motion",
    content:
      "Click \"Generate motion\" to create the court-ready document. When generation completes, you'll see a status banner with a Download button.",
  },
  {
    id: "download",
    target: '[data-tour="download-banner"]',
    title: "Download and regenerate",
    content:
      "When the status is READY, click Download to save the .docx. If you change inputs, use Regenerate to create a new version.",
    optional: true,
  },
];

/**
 * Template builder tour (TemplateDialog wizard)
 */
export const templateBuilderTourSteps: TourStep[] = [
  {
    id: "tpl-title",
    target: '[data-tour="template-dialog-title"]',
    title: "Template builder",
    content:
      "This wizard creates reusable motion templates. We'll walk through the key settings and signature fields.",
  },
  {
    id: "tpl-name",
    target: '[data-tour="tpl-name"]',
    title: "Name your template",
    content:
      "Use a short name your team recognizes (for example, Motion to Compel - Florida).",
  },
  {
    id: "tpl-language",
    target: '[data-tour="tpl-language"]',
    title: "Choose a language",
    content:
      "This sets default section titles. You can still edit sections later.",
  },
  {
    id: "tpl-caption",
    target: '[data-tour="tpl-include-caption"]',
    title: "Caption block",
    content:
      "Turn this on to include court name, case number, and the party caption at the top.",
  },
  {
    id: "tpl-references",
    target: '[data-tour="tpl-include-references"]',
    title: "References section",
    content:
      "Turn this on to include a References section in the final document.",
  },
  {
    id: "tpl-signature",
    target: '[data-tour="tpl-include-signature"]',
    title: "Signature block",
    content:
      "Turn this on to include a signature block. You can add multiple address lines and phone numbers.",
  },
  {
    id: "tpl-add-address",
    target: '[data-tour="tpl-add-address-line"]',
    title: "Multiple address lines",
    content:
      "Use this button to add additional address lines (suite, floor, etc.).",
    optional: true,
  },
  {
    id: "tpl-add-phone",
    target: '[data-tour="tpl-add-phone-number"]',
    title: "Multiple phone numbers",
    content:
      "Use this button to add additional phone numbers.",
    optional: true,
  },
  {
    id: "tpl-generate",
    target: '[data-tour="tpl-generate-markdown"]',
    title: "Generate the markdown template",
    content:
      "Click Generate Markdown to build the final template text based on your selections.",
  },
  {
    id: "tpl-preview",
    target: '[data-tour="tpl-preview"]',
    title: "Preview",
    content:
      "Review the generated template here. You can switch to Markdown (advanced) to edit directly.",
  },
  {
    id: "tpl-save",
    target: '[data-tour="tpl-save"]',
    title: "Save",
    content:
      "Click Save to store this template so it can be used during motion generation.",
  },
];
