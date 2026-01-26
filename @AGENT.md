# Agent Build Instructions

## Project Overview
Open Source Village is a Next.js 14 application with TypeScript, using Bun as the package manager.
- **Frontend**: Next.js 14 with React 18, Tailwind CSS
- **Backend**: Next.js API routes
- **Package Manager**: Bun (fast alternative to npm/yarn)
- **Storage**: File-based with JSON/JSONL files
- **Testing**: Jest with React Testing Library

## Project Setup
```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Initialize data directories
mkdir -p data/badges data/usernames data/logs
```

## Running Tests
```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun run test:coverage
```

## Build Commands
```bash
# Development build and server
bun dev

# Production build
bun run build

# Start production server (after build)
bun start
```

## Development Server
```bash
# Start development server (hot reload enabled)
bun dev

# Server runs on http://localhost:3000
```

## Key Learnings
- **Bun vs npm**: Bun is significantly faster for install and test execution
- **File Storage**: Data directory structure follows specs/TECHNICAL_SPEC.md
  - `data/badges/{serialNumber}/profile.json` - user profiles
  - `data/usernames/{username}` - symlinks to badge directories
  - `data/badges/{serialNumber}/queue.jsonl` - blockchain operation queue
- **API Routes**: Located in `src/app/api/*` following Next.js 14 App Router conventions
- **Type Safety**: All types defined in `src/types/index.ts` based on technical spec

## Feature Development Quality Standards

**CRITICAL**: All new features MUST meet the following mandatory requirements before being considered complete.

### Testing Requirements

- **Minimum Coverage**: 85% code coverage ratio required for all new code
- **Test Pass Rate**: 100% - all tests must pass, no exceptions
- **Test Types Required**:
  - Unit tests for all business logic and services
  - Integration tests for API endpoints or main functionality
  - End-to-end tests for critical user workflows
- **Coverage Validation**: Run coverage reports before marking features complete:
  ```bash
  bun run test:coverage
  ```
- **Test Quality**: Tests must validate behavior, not just achieve coverage metrics
- **Test Documentation**: Complex test scenarios must include comments explaining the test strategy

### Git Workflow Requirements

Before moving to the next feature, ALL changes must be:

1. **Committed with Clear Messages**:
   ```bash
   git add .
   git commit -m "feat(module): descriptive message following conventional commits"
   ```
   - Use conventional commit format: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, etc.
   - Include scope when applicable: `feat(api):`, `fix(ui):`, `test(auth):`
   - Write descriptive messages that explain WHAT changed and WHY

2. **Pushed to Remote Repository**:
   ```bash
   git push origin <branch-name>
   ```
   - Never leave completed features uncommitted
   - Push regularly to maintain backup and enable collaboration
   - Ensure CI/CD pipelines pass before considering feature complete

3. **Branch Hygiene**:
   - Work on feature branches, never directly on `main`
   - Branch naming convention: `feature/<feature-name>`, `fix/<issue-name>`, `docs/<doc-update>`
   - Create pull requests for all significant changes

4. **Ralph Integration**:
   - Update @fix_plan.md with new tasks before starting work
   - Mark items complete in @fix_plan.md upon completion
   - Update PROMPT.md if development patterns change
   - Test features work within Ralph's autonomous loop

### Documentation Requirements

**ALL implementation documentation MUST remain synchronized with the codebase**:

1. **Code Documentation**:
   - Language-appropriate documentation (JSDoc, docstrings, etc.)
   - Update inline comments when implementation changes
   - Remove outdated comments immediately

2. **Implementation Documentation**:
   - Update relevant sections in this AGENT.md file
   - Keep build and test commands current
   - Update configuration examples when defaults change
   - Document breaking changes prominently

3. **README Updates**:
   - Keep feature lists current
   - Update setup instructions when dependencies change
   - Maintain accurate command examples
   - Update version compatibility information

4. **AGENT.md Maintenance**:
   - Add new build patterns to relevant sections
   - Update "Key Learnings" with new insights
   - Keep command examples accurate and tested
   - Document new testing patterns or quality gates

### Feature Completion Checklist

Before marking ANY feature as complete, verify:

- [ ] All tests pass with appropriate framework command
- [ ] Code coverage meets 85% minimum threshold
- [ ] Coverage report reviewed for meaningful test quality
- [ ] Code formatted according to project standards
- [ ] Type checking passes (if applicable)
- [ ] All changes committed with conventional commit messages
- [ ] All commits pushed to remote repository
- [ ] @fix_plan.md task marked as complete
- [ ] Implementation documentation updated
- [ ] Inline code comments updated or added
- [ ] AGENT.md updated (if new patterns introduced)
- [ ] Breaking changes documented
- [ ] Features tested within Ralph loop (if applicable)
- [ ] CI/CD pipeline passes

### Rationale

These standards ensure:
- **Quality**: High test coverage and pass rates prevent regressions
- **Traceability**: Git commits and @fix_plan.md provide clear history of changes
- **Maintainability**: Current documentation reduces onboarding time and prevents knowledge loss
- **Collaboration**: Pushed changes enable team visibility and code review
- **Reliability**: Consistent quality gates maintain production stability
- **Automation**: Ralph integration ensures continuous development practices

**Enforcement**: AI agents should automatically apply these standards to all feature development tasks without requiring explicit instruction for each task.
