# 🎯 prompt-studio

**Local prompt manager for AI developers.**

Create, version, test, and compare prompts across LLMs — right from your terminal.

```bash
npm install -g @kevinxyz/prompt-studio
prompt init
prompt run greeting --var name=World
prompt compare code-review --models gpt-4o-mini,gpt-4o,claude-3-haiku
```

## Why?

Prompt engineering is becoming a core skill for developers. Yet most people manage prompts by:
- Pasting them into ChatGPT and losing track of versions
- Keeping a messy Notes app with 20 variants
- Never comparing how different models handle the same prompt

**prompt-studio** fixes this. Keep prompts as local Markdown files, version them with git, test them instantly.

## Quick Start

```bash
# Initialize with example prompts
prompt init

# List all prompts
prompt list

# Set your API key first
# You can also set OPENAI_API_KEY instead
export AI_ANNOTATOR_API_KEY="sk-your-key-here"

# Run a prompt
prompt run greeting --var name=World

# Create your own
prompt new my-prompt
prompt run my-prompt --var topic=AI --model gpt-4o-mini
```

## Prompt Format

Prompts are simple Markdown files with optional YAML frontmatter:

```markdown
---
model: gpt-4o-mini
temperature: 0.7
max_tokens: 500
lang: en
---
You are a {{role}}. Explain {{topic}} in simple terms.
```

Variables use `{{double_curly_braces}}` syntax. Set them with `--var key=value`.

## All Commands

| Command | Description |
|---------|-------------|
| `prompt init` | Create example prompts in `.prompts/` |
| `prompt list` | List all prompts |
| `prompt new <name>` | Create a new prompt template |
| `prompt show <name>` | Show a prompt's full content |
| `prompt run <name>` | Execute a prompt via LLM |
| `prompt run <name> --raw "hello"` | Use raw text instead of file |
| `prompt compare <name>` | Run on multiple models side by side |
| `prompt preview <name>` | Show resolved template (no API call) |
| `prompt log` | View recent run history |
| `prompt update` | Check for updates and upgrade to latest version |
| `prompt rm <name>` | Delete a prompt |

## Options

```
--var key=val        Set template variable values
--model <name>       Override model (default: gpt-4o-mini)
--temp <n>           Override temperature
--max-tokens <n>     Override max tokens
--lang <en|zh>       Shortcut for --var lang=...
--preview            Dry-run (show resolved prompt, no API call)
--models <list>      For compare: comma-separated model list
```

## Environment Variables (Required)

You must set an API key before running any prompt:

| Variable | Description |
|----------|-------------|
| `AI_ANNOTATOR_API_KEY` | **OpenAI API key** (recommended, overrides `OPENAI_API_KEY`) |
| `OPENAI_API_KEY` | Fallback API key |

**Quick setup** (choose one):
```bash
# Set directly (replace with your real key)
export AI_ANNOTATOR_API_KEY="sk-..."

# Or add to ~/.zshrc to persist
# echo 'export AI_ANNOTATOR_API_KEY="sk-..."' >> ~/.zshrc

# Or use .env in your project
echo 'AI_ANNOTATOR_API_KEY=sk-...' > .env
```

Optional:
| Variable | Default | Description |
|----------|---------|-------------|
| `PROMPT_STUDIO_MODEL` | `gpt-4o-mini` | Default model |

> 💡 **Get an API key**: Sign up at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) to get a free trial key.

## Example Workflow

```bash
# 1. Set up
cd my-project
npm install @kevinxyz/prompt-studio
prompt init

# 2. Create a prompt for code review
prompt new code-review

# 3. Edit it (it's just a Markdown file!)
# echo "your prompt here" > .prompts/code-review.md

# 4. Run it
prompt run code-review --var language=Python --var code="print('hello')"

# 5. Compare across models
prompt compare code-review --models gpt-4o-mini,gpt-4o

# 6. Check run history
prompt log
```

## File Structure

```
.prompts/
├── greeting.md        # Example: friendly greeting
├── code-review.md     # Example: code review
├── summarize.md       # Example: text summarization
├── translate.md       # Example: translation
├── your-prompt.md     # Your custom prompts
├── system.md          # Optional: shared system prompt
└── .history.jsonl     # Run log (auto-generated)
```

All prompts are plain text — commit them to git, share with your team, track changes like code.

## Benefits Over Web UI

- **Version controlled** — git diff your prompts
- **Local** — no data leaves your machine
- **Scriptable** — use in CI/CD pipelines
- **Model agnostic** — switch between OpenAI, Anthropic, etc.
- **Cost effective** — compare outputs before committing to expensive models

## Roadmap

- [x] Template variables
- [x] Multi-model comparison
- [x] Run history
- [ ] Anthropic/Claude API support
- [ ] Batch run (run 10 prompts, save outputs)
- [ ] Export to shareable format
- [ ] Local web UI dashboard

## License

MIT
