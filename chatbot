# Chat API Contract — **Frozen v1.0**

This document defines the **final, frozen v1.0** contract for an LLM-powered real-estate chatbot.
It is intended to be committed directly into a repository and used as the single source of truth for **FE, BE, LLM, and Analytics**.

---

## 0. Core Principles (v1.0)

- **Only two enums**
  - `eventType`: `message | info`
  - `messageType`: `context | text | template | user_action | markdown | html | analytics`
- **Every bot message MUST have `messageId`**
- **Every user_action MUST reference the originating `messageId`**
- **Templates are FE-owned** (custom rendering is allowed and expected)
- **`fallbackText` is mandatory for templates**
- **Analytics & context are informational, not conversational**
- **All future changes must be additive (v1.x)**

---

## 1. JSON Schema (Draft 7)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ChatEvent",
  "type": "object",
  "required": ["eventId", "conversationId", "eventType", "sender", "payload"],
  "properties": {
    "eventId": { "type": "string" },
    "conversationId": { "type": "string" },

    "eventType": {
      "type": "string",
      "enum": ["message", "info"]
    },

    "sender": {
      "type": "object",
      "required": ["type", "id"],
      "properties": {
        "type": { "type": "string", "enum": ["user", "bot", "system"] },
        "id": { "type": "string" }
      }
    },

    "payload": {
      "type": "object",
      "required": ["messageType", "content"],
      "properties": {
        "messageId": {
          "type": "string",
          "description": "Required when sender.type = bot"
        },

        "messageType": {
          "type": "string",
          "enum": [
            "context",
            "text",
            "template",
            "user_action",
            "markdown",
            "html",
            "analytics"
          ]
        },

        "visibility": {
          "type": "string",
          "enum": ["shown", "hidden"],
          "description": "Only applicable when eventType = info"
        },

        "content": {
          "type": "object",
          "properties": {
            "text": { "type": "string" },
            "templateId": { "type": "string" },
            "data": { "type": "object" },
            "preText": { "type": "string" },
            "fallbackText": { "type": "string" },
            "followUpText": { "type": "string" },
            "derivedLabel": { "type": "string" }
          },
          "additionalProperties": false
        },

        "actions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "label", "replyType", "scope"],
            "properties": {
              "id": { "type": "string" },
              "label": { "type": "string" },
              "replyType": { "type": "string", "enum": ["visible", "hidden"] },
              "scope": { "type": "string", "enum": ["message", "template_item"] }
            }
          }
        }
      }
    },

    "metadata": { "type": "object" }
  },

  "allOf": [
    {
      "if": {
        "properties": {
          "sender": { "properties": { "type": { "const": "bot" } } }
        }
      },
      "then": {
        "properties": {
          "payload": { "required": ["messageId"] }
        }
      }
    },
    {
      "if": {
        "properties": {
          "payload": {
            "properties": { "messageType": { "const": "user_action" } }
          }
        }
      },
      "then": {
        "properties": {
          "payload": {
            "properties": {
              "content": {
                "required": ["data", "derivedLabel"],
                "properties": {
                  "data": { "required": ["messageId"] }
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

---

## 2. Allowed `messageType` by Sender

| messageType | user | bot | system |
|------------|------|-----|--------|
| context | ❌ | ❌ | ✅ |
| text | ✅ | ✅ | ❌ |
| markdown | ❌ | ✅ | ❌ |
| html | ❌ | ✅ | ❌ |
| template | ❌ | ✅ | ❌ |
| user_action | ✅ | ❌ | ❌ |
| analytics | ❌ | ⚠️ | ✅ |

---

## 3. FE Rendering Rules (Decision Table)

| Condition | FE Behavior |
|---------|-------------|
| info + analytics | Never render |
| info + visibility != shown | Do not render |
| context | Do not render |
| template supported | Render template |
| template unsupported | Render fallbackText |
| markdown/html | Safe render |
| user_action | Render derivedLabel |
| action scope = template_item | Render per item |
| action scope = message | Render once |
| replyType = hidden | No echo, no LLM |

---

## 4. Examples

### 4.1 Context on Chat Open

```json
{
  "eventId": "evt_001",
  "conversationId": "conv_1",
  "eventType": "info",
  "sender": { "type": "system", "id": "web_app" },
  "payload": {
    "messageType": "context",
    "content": {
      "data": {
        "page": "SRP",
        "filters": {
          "apartment_type": "2bhk",
          "property_type": "independent_house",
          "price": ["1cr", "2cr"],
          "location": ["Powai"]
        }
      }
    }
  }
}
```

### 4.2 User Text

```json
{
  "eventType": "message",
  "sender": { "type": "user" },
  "payload": {
    "messageType": "text",
    "content": { "text": "hi" }
  }
}
```

### 4.3 Bot Greeting

```json
{
  "eventType": "message",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_001",
    "messageType": "markdown",
    "content": {
      "text": "Hey! I see you’re looking for 2BHK independent houses. How can I help?"
    }
  }
}
```

### 4.4 Property Carousel

```json
{
  "eventType": "message",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_002",
    "messageType": "template",
    "content": {
      "templateId": "property_carousel",
      "data": {
        "properties": [
          { "id": "p1", "title": "2BHK · 80L" },
          { "id": "p2", "title": "2BHK · 90L" }
        ]
      },
      "fallbackText": "P1: 80L, P2: 90L"
    },
    "actions": [
      { "id": "shortlist", "label": "Shortlist", "replyType": "visible", "scope": "template_item" }
    ]
  }
}
```

### 4.5 User Action

```json
{
  "eventType": "info",
  "sender": { "type": "user" },
  "payload": {
    "messageType": "user_action",
    "content": {
      "data": {
        "actionId": "shortlist",
        "objectId": "p2",
        "messageId": "msg_002"
      },
      "derivedLabel": "Shortlisted P2"
    }
  }
}
```

### 4.6 Analytics

```json
{
  "eventType": "info",
  "sender": { "type": "system" },
  "payload": {
    "messageType": "analytics",
    "content": {
      "data": {
        "category": "journey",
        "action": "shortlist",
        "label": "p2"
      }
    }
  }
}
```

---

## 5. FE Renderer Pseudocode

```ts
function renderEvent(event) {
  const { eventType, payload } = event;

  if (eventType === "info") {
    if (payload.messageType === "analytics") return;
    if (payload.visibility !== "shown") return;
  }

  if (payload.messageType === "context") return;

  if (payload.content?.preText) renderText(payload.content.preText);

  switch (payload.messageType) {
    case "text":
      renderText(payload.content.text);
      break;
    case "markdown":
      renderMarkdown(payload.content.text);
      break;
    case "html":
      renderHTMLSafely(payload.content.text);
      break;
    case "template":
      if (isTemplateSupported(payload.content.templateId)) {
        renderTemplate(
          payload.content.templateId,
          payload.content.data,
          payload.actions?.filter(a => a.scope === "template_item")
        );
      } else {
        renderText(payload.content.fallbackText || "");
      }
      break;
    case "user_action":
      renderUserBubble(payload.content.derivedLabel);
      break;
  }

  const footerActions = payload.actions?.filter(a => a.scope === "message") || [];
  if (footerActions.length) renderActions(footerActions);

  if (payload.content?.followUpText) renderText(payload.content.followUpText);
}
```

---

## Status

**Chat API Contract v1.0 — FROZEN ✅**
