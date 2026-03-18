# INSTALL

## Prerequisites
- Node version 22
- npm
- pm2

## Deploy steps
- clone repo
- install dependencies, npm install
- set environment variables
- start with PM2

## Notes
- database files are local and ignored
- use a separate Telegram token for production
- OpenRouter key is currently provided through OPENAI_API_KEY env naming

## Digital Ocean Specifics
- mv ai-bot to ~/.openclaw/workspace

- Add below mount/bind section in ~/.openclaw/openclaw.json

    "list": [
      {
        "id": "ai-bot",
        "workspace": "/workspace/ai-bot"
      }
    ]
  },

- Bashrc env not recoginzed by bot so create ecosystem.config.cjs
mv ecosystem.config.cjs.example ecosystem.config.cjs
and add you own tokens.


