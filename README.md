# All Projects Monorepo

Unified repository and subpath gateway for all six AI/engineering projects.

## Projects

| Project | URL Path | Default Upstream Port | Folder |
| --- | --- | --- | --- |
| Agent Assurance Laboratory | `/Agent_Assurence` | `8001` | [`Agent_Assurence`](./Agent_Assurence) |
| AI Operations Diagnostic | `/AI-operations-Diagonostic` | `3001` | [`AI-operations-Diagonostic`](./AI-operations-Diagonostic) |
| Construction Variation Tracker | `/Construction-variation-tracker` | `5173` | [`Construction-variation-tracker`](./Construction-variation-tracker) |
| Contract & Invoice Leakage Finder | `/Contract-Invoice-Leakage-Finder` | `5174` | [`Contract-Invoice-Leakage-Finder`](./Contract-Invoice-Leakage-Finder) |
| Industry-Specific Lead-to-Order Agent | `/Industry-Specific-Lead-to-Order-Agent` | `5175` | [`Industry-Specific-Lead-to-Order-Agent`](./Industry-Specific-Lead-to-Order-Agent) |
| Procurement Quote Comparison Agent | `/Procurement-Quote-Comparison-Agent` | `3002` | [`Procurement-Quote-Comparison-Agent`](./Procurement-Quote-Comparison-Agent) |

## Unified `/project-name` Routing

### Local Gateway (Python, zero external dependencies)

Start the gateway:

```powershell
python gateway/server.py
```

Then open:
- Portal hub: `http://localhost:8080/`
- Any project directly: `http://localhost:8080/<project-name>/`

When running Vite or Next.js frontends behind the gateway, set the base path environment variable so assets and client routes resolve under `/<project-name>`:

- **Vite apps**: `VITE_BASE_PATH=/<project-name>/`
- **Next.js apps**: `NEXT_PUBLIC_BASE_PATH=/<project-name>`

### Nginx (Cloud / Docker)

An Nginx reverse-proxy configuration is also provided in [`gateway/nginx.conf`](./gateway/nginx.conf) alongside the portal page [`gateway/index.html`](./gateway/index.html).
