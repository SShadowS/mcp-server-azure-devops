# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An MCP (Model Context Protocol) server that enables AI assistants to interact with Azure DevOps APIs. Built with TypeScript, it provides tools for managing projects, work items, repositories, pull requests, pipelines, wikis, and search.

## Commands

```bash
# Install dependencies (allow 60+ seconds)
npm install

# Build
npm run build

# Run server
npm run dev          # Development with hot reload
npm run start        # Production mode
npm run inspector    # Debug with MCP Inspector

# Testing
npm run test:unit    # Unit tests only (no credentials needed)
npm run test:int     # Integration tests (requires Azure DevOps credentials)
npm run test:e2e     # E2E tests (requires credentials)
npm test             # All tests

# Run single test file
npx jest path/to/file.spec.unit.ts --config jest.unit.config.js

# Code quality
npm run lint:fix     # Lint and auto-fix
npm run format       # Format with Prettier

# Commits (conventional commits required)
npm run commit       # Interactive commit helper
```

## Architecture

**Feature-based module structure** - each Azure DevOps feature area is self-contained:

```
src/features/[feature-name]/
├── index.ts              # Exports + request handlers (isXRequest, handleXRequest)
├── schemas.ts            # Zod schemas for the feature
├── types.ts              # TypeScript types
├── tool-definitions.ts   # MCP tool definitions
└── [tool-name]/
    ├── feature.ts           # Core implementation
    ├── schema.ts            # Tool-specific schema
    ├── feature.spec.unit.ts # Unit tests (mocked)
    └── feature.spec.int.ts  # Integration tests (real API)
```

**Key entry points:**
- `src/index.ts` - CLI entry point
- `src/server.ts` - MCP server initialization and tool registration
- `src/clients/azure-devops.ts` - Azure DevOps client factory

**Shared code:**
- `src/shared/auth/` - Authentication handlers (PAT, Azure Identity, Azure CLI)
- `src/shared/errors/` - Custom error classes (AzureDevOpsError, AzureDevOpsResourceNotFoundError)
- `src/shared/types/` - Request handler interfaces

## Adding New Features

1. Create `src/features/[feature-name]/` directory following the pattern above
2. Export `is[Feature]Request` and `handle[Feature]Request` functions from index.ts
3. Register in `src/server.ts` (add to feature handlers array)
4. Add unit tests (required) and integration tests (if applicable)

Reference `src/features/projects/` or `src/features/work-items/` as examples.

## Testing Approach

This project uses the **Testing Trophy** approach:
- **Unit tests** (`*.spec.unit.ts`): Mock external dependencies, test isolated logic
- **Integration tests** (`*.spec.int.ts`): Test with real Azure DevOps APIs
- **E2E tests** (`*.spec.e2e.ts`): Only at server level, test full MCP protocol

Tests are co-located with feature code. Use Arrange/Act/Assert pattern.

## Environment Setup

Copy `.env.example` to `.env`:
```
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
AZURE_DEVOPS_AUTH_METHOD=pat  # or azure-identity, azure-cli
AZURE_DEVOPS_PAT=your-token   # for PAT auth
AZURE_DEVOPS_DEFAULT_PROJECT=your-project
```

## Code Style

- Path aliases: Use `@/` for src imports (e.g., `import { x } from '@/shared/errors'`)
- Schemas: Use Zod for all input validation
- Errors: Use custom error classes from `@/shared/errors`
- Files: kebab-case naming (e.g., `get-work-item/feature.ts`)

## Pre-PR Checklist

```bash
npm run lint:fix && npm run format
npm run build
npm run test:unit
```

## Skills

Reference these when working on related tasks:
- **skill-creator**: `.github/skills/skill-creator/SKILL.md` - Creating new skills
- **azure-devops-rest-api**: `.github/skills/azure-devops-rest-api/SKILL.md` - API specifications and integration patterns
