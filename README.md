# Taiga Front Modern

A modern, independently deployable frontend for the stable Taiga backend. The project is an
incremental replacement for `taiga-front`: completed areas can move to this app while unfinished
flows keep using the classic UI.

## Stack

- Angular 22 standalone components, signals and strict TypeScript
- Angular Material 3, CDK and Angular Aria
- Vitest for unit tests
- Nginx runtime image with deploy-time configuration

The frontend intentionally starts without NgRx or another global state framework. Feature services
and signals are the default; a larger state layer should only be introduced when real cross-feature
state makes it necessary.

## Local development

Requirements: Node 24 and npm 11 or newer.

```bash
npm ci
npm start
```

The development app reads `public/config.json`. Point `api` at the stable Taiga API you want to use.
If it is on another origin, that origin must be allowed by the Taiga backend.

Useful checks:

```bash
npm run format:check
npm run test:ci
npm run build
```

## Runtime configuration

The Docker image creates `/config.json` when the container starts, so the same image can be promoted
between environments without rebuilding it.

| Variable           | Default    | Meaning                                    |
| ------------------ | ---------- | ------------------------------------------ |
| `TAIGA_API_URL`    | `/api/v1/` | Stable Taiga REST API URL                  |
| `TAIGA_EVENTS_URL` | `/events`  | Taiga events/WebSocket URL                 |
| `TAIGA_LEGACY_URL` | `/legacy/` | Classic frontend used for unfinished flows |

Only public browser configuration belongs in these variables. Do not put secrets in them.

## Docker and Coolify

Build the repository from its root with the included `Dockerfile`; the container listens on port 80
and exposes `/healthz`. M1 is intentionally served at a domain root; path-prefix deployment is not
supported yet.

There are two supported deployment topologies:

- Behind the existing Taiga gateway: route `/` to this container, keep `/api` and `/events` on their
  existing upstreams, and route `/legacy/` to classic `taiga-front`. The relative defaults work in
  this topology.
- On a dedicated domain: set `TAIGA_API_URL`, `TAIGA_EVENTS_URL`, and `TAIGA_LEGACY_URL` to the full
  public HTTPS/WSS URLs of the existing Taiga installation. The backend must allow the modern
  frontend origin and the `Authorization`, `Accept-Language`, and `X-Session-Id` request headers.

The frontend does not proxy the API, WebSocket, or classic frontend itself. Those routes belong to
the existing Taiga gateway or Coolify proxy.

## Migration milestones

1. Foundation: responsive shell, Material 3 tokens, runtime config, authentication and API client.
2. Daily work: real project switcher, Kanban, filters, tags and accessible card movement.
3. Work item details: stories, tasks, issues, comments, attachments and activity.
4. Planning: epics, backlog, sprints and team views.
5. Administration and removal of the classic frontend fallback.

Every migrated route must work against the existing stable backend and pass unit, keyboard and
browser-level smoke checks before it replaces the corresponding classic route.
