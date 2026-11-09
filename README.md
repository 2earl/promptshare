# promptshare

Prompt share, at [promptshare.cc](https://promptshare.cc): save LLM prompts once and use them from
any assistant, and continue a conversation's state in another session, another assistant, or with
people you invite. Signed in with a 2earl account
([login.2earl.com](https://github.com/2earl/login)); assistants reach it through the
[2earl MCP gateway](https://github.com/2earl/mcp).

**Status:** phase P1 built: the assistant tools (private prompts, shared sessions between your own
assistants) behind the 2earl MCP gateway. Not deployed yet; see
[infra/README.md](infra/README.md#first-deployment).

## Documents

- [Design](docs/DESIGN.md): prompts, shared sessions, MCP tools, data, moderation, phases
- [Threat model](docs/THREAT_MODEL.md)
- [Legal requirements](docs/LEGAL.md): what hosting users' content requires, and where it is met

## Development

```sh
pnpm install
pnpm test        # Workers runtime (vitest + @cloudflare/vitest-plugin)
pnpm typecheck
pnpm lint
pnpm build       # dry-run bundle
```

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE)
