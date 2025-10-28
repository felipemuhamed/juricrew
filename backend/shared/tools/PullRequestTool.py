import os
from git import Repo
from github import Github
from atlassian.bitbucket import Cloud
from crewai.tools import BaseTool
from pydantic import Field
from typing import Dict, Any

class PullRequestTool(BaseTool):
    name: str = "Pull Request Manager"
    description: str = (
        "Gerencia todo o fluxo de criação de Pull Requests em repositórios locais existentes. "
        "Formato do input: dict com parâmetros: "
        "{"
        "'branch': 'nome-da-branch', "
        "'commit_message': 'mensagem do commit', "
        "'pr_title': 'título do PR', "
        "'pr_description': 'descrição do PR'"
        "}"
    )
    
    github_token: str = Field(default=os.getenv("GIT_TOKEN"))
    bitbucket_username: str = Field(default=os.getenv("GIT_USERNAME"))
    bitbucket_app_password: str = Field(default=os.getenv("GIT_TOKEN"))

    def _run(self, query: dict) -> str:
        try:
            params = query
            return self._process_pull_request(params)
        except Exception as e:
            return f"Error: {str(e)}"

    def _process_pull_request(self, params: Dict[str, Any]) -> str:
        # Validação dos parâmetros
        platform = os.getenv("PLATFORM_REPO")
        local_repo_path = os.path.expanduser("cloned_repos")
        remote_repo = os.getenv("REMOTE_REPO")
        branch = params["branch"]
        base_branch = os.getenv("MAIN_BRANCH")
        commit_message = params["commit_message"]
        pr_title = params["pr_title"]
        pr_description = params.get("pr_description", "")

        # Acesso ao repositório local
        repo = Repo(local_repo_path)
        
        # Configurar autenticação no remote
        self._set_authenticated_remote(repo, platform, remote_repo)
        
        # Configurar usuário do Git
        self._configure_git_user(repo)
        
        # Sincronizar branch base
        self._sync_base_branch(repo, base_branch)
                
        repo.git.stash("save", "stash before branch switch")
        self._create_and_checkout_branch(repo, branch)
        repo.git.stash("pop")  # recupera alterações

        # Fazer commit e push de todas as alterações
        self._commit_and_push(repo, branch, commit_message)
        
        # Criar Pull Request
        pr_url = self._create_pull_request(platform, remote_repo, branch, base_branch, pr_title, pr_description)
        
        return f"✅ PR criado com sucesso: {pr_url}"

    def _set_authenticated_remote(self, repo: Repo, platform: str, remote_repo: str):
        origin = repo.remote(name='origin')
        if platform == "github":
            new_url = f"https://{self.github_token}@github.com/{remote_repo}.git"
        elif platform == "bitbucket":
            new_url = f"https://{self.bitbucket_username}:{self.bitbucket_app_password}@bitbucket.org/{remote_repo}.git"
        else:
            raise ValueError("Plataforma inválida")
        
        origin.set_url(new_url)

    def _configure_git_user(self, repo: Repo):
        with repo.config_writer() as config:
            config.set_value("user", "name", "Automated PR Bot")
            config.set_value("user", "email", "pr-bot@example.com")

    def _sync_base_branch(self, repo: Repo, base_branch: str):
        # Se não houver alterações, sincroniza normalmente
        if not repo.is_dirty(untracked_files=True):
            repo.git.checkout(base_branch)
            repo.remotes.origin.pull()
        else:
            # Pula checkout para não perder alterações
            print(f"[INFO] Alterações locais detectadas. Pulando checkout de {base_branch}.")

    def _create_and_checkout_branch(self, repo: Repo, branch: str):
        if branch in repo.heads:
            repo.heads[branch].checkout()
        else:
            new_branch = repo.create_head(branch)
            new_branch.checkout()

    def _commit_and_push(self, repo: Repo, branch: str, message: str):
        # Verifica se há alterações para commitar
        if not repo.is_dirty(untracked_files=True):
            raise ValueError("Nenhuma modificação encontrada para commitar")

        # Adiciona todas as alterações (incluindo novos arquivos)
        repo.git.add(all=True)
        
        # Faz o commit
        repo.index.commit(message)
        
        # Faz push para o remote
        repo.remotes.origin.push(branch)

    def _create_pull_request(self, platform: str, remote_repo: str, head: str, base: str, title: str, description: str) -> str:
        if platform == "github":
            return self._create_github_pr(remote_repo, head, base, title, description)
        elif platform == "bitbucket":
            return self._create_bitbucket_pr(remote_repo, head, base, title, description)
        
        raise ValueError("Plataforma não suportada")

    def _create_github_pr(self, repo_path: str, head: str, base: str, title: str, description: str) -> str:
        github = Github(self.github_token)
        repo = github.get_repo(repo_path)
        pr = repo.create_pull(
            title=title,
            body=description,
            head=head,
            base=base
        )
        return pr.html_url

    def _create_bitbucket_pr(self, repo_path: str, head: str, base: str, title: str, description: str) -> str:
        cloud = Cloud(
            username=self.bitbucket_username,
            password=self.bitbucket_app_password
        )
        workspace, repo_slug = repo_path.split("/")
        repo = cloud.repositories.get(workspace, repo_slug)
        
        # Criar o Pull Request
        pr = repo.pullrequests.create(
            title=title,
            description=description,
            source_branch=head,
            destination_branch=base
        )
        
        # Usar o método get_link para obter a URL do PR
        return pr.get_link('html')