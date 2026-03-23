# INSTALL

## Prerequisites
- Node.js 22
- npm
- PM2

## Deploy steps
1. Clone the repo:
```
</> Bash

git clone https://github.com/bisbeebucky/ai-bot
cd ai-bot
```

2. Install dependencies:
```
</> Bash

npm install
```

3. Set environment variables.

4. Start the bot with PM2.

## Notes

- Local database files are automatically generated and ignored by Git.

- Use a separate Telegram bot token for production.

- The OpenRouter key is currently passed through the OPENAI_API_KEY environment variable name.

## Digital Ocean Specifics

- Move the ai-bot directory into the Docker container workspace
```
</> Bash

mv ai-bot ~/.openclaw/workspace
```
- Bashrc env not recoginzed by bot so create ecosystem.config.cjs and add your own tokens
```
</> Bash

mv ~/workspace/ai-bot/ecosystem.config.cjs.example ~/workspace/ai-bot/ecosystem.config.cjs
```
- Back up your openclaw.json file
```
</> Bash

cp .openclaw/openclaw.json openclaw.json
```

- Version v2026.03.13 .openclaw/openclaw.json
```
</> JSON

{
  "meta": {
    "lastTouchedVersion": "2026.3.12",
    "lastTouchedAt": "2026-03-23T06:17:02.503Z"
  },
  "wizard": {
    "lastRunAt": "2026-03-23T05:36:41.321Z",
    "lastRunVersion": "2026.3.12",
    "lastRunCommand": "onboard",
    "lastRunMode": "local"
  },
  "auth": {
    "profiles": {
      "openrouter:default": {
        "provider": "openrouter",
        "mode": "api_key"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openrouter/auto"
      },
      "models": {
        "openrouter/auto": {
          "alias": "OpenRouter"
        }
      },
      "workspace": "/home/openclaw/.openclaw/workspace"
    }
  },
  "tools": {
    "profile": "coding",
    "web": {
      "search": {
        "provider": "gemini"
      }
    }
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto",
    "restart": true,
    "ownerDisplay": "raw"
  },
  "session": {
    "dmScope": "per-channel-peer"
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "pairing",
      "groupPolicy": "disabled",
      "streaming": "partial"
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "lan",
    "controlUi": {
      "enabled": true,
      "allowedOrigins": [
        "https://24.199.108.165"
      ]
    },
    "auth": {
      "mode": "token",
      "token": "YOUR_GATEWAY_TOKEN_GOES_HERE",
      "rateLimit": {
        "maxAttempts": 10,
        "windowMs": 60000,
        "lockoutMs": 300000
      }
    },
    "trustedProxies": [
      "127.0.0.1",
      "::1"
    ],
    "tailscale": {
      "mode": "off",
      "resetOnExit": false
    }
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
```
