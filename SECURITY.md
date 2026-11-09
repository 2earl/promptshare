# Security Policy

This repository contains Prompt share: the website at `promptshare.cc` and the MCP tools offered
through the 2earl MCP gateway. It holds users' prompts and the conversation state they share.
Please do **not** report security vulnerabilities through public issues, discussions or pull
requests.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:
**Security → Report a vulnerability** on this repository.

Include as much of the following as you can:

- affected page, tool or component
- steps to reproduce or a proof of concept
- impact you believe it has

You will receive an acknowledgement after the report is reviewed. Please allow time for a fix
before any public disclosure.

## Scope

In scope: the code in this repository and its deployment at `promptshare.cc`. Sign-in and tokens
are [2earl/login](https://github.com/2earl/login)'s; the assistant endpoint is
[2earl/mcp](https://github.com/2earl/mcp)'s. Report issues in those repositories there.

Out of scope: denial-of-service through volumetric traffic, social engineering, and findings in
third-party services (Cloudflare, GitHub).

Illegal or harmful content on Prompt share is not a security issue: use the **Report** link on
the content or `promptshare.cc/report`.
