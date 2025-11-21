# iOS Shortcuts Setup Guide

## Quick Overview
iOS Shortcuts lets you create home screen buttons that instantly log events to Flō without opening the app. One tap = logged event.

## Prerequisites
- iPhone running iOS 13 or later
- Flō account (logged in on the website)
- Shortcuts app (pre-installed on iPhone)

---

## Step 1: Generate Your API Key

1. Open Flō in your browser: https://get-flo.com
2. Log in to your account
3. Go to **Profile** (bottom navigation)
4. Scroll down to the **Actions** section
5. Tap **iOS Shortcuts**
6. Tap the **Generate Key** button
7. **IMPORTANT**: Copy and save this key immediately - you won't see it again!
   - It looks like: `flo_abc123def456...`

---

## Step 2: Choose a Shortcut Template

On the iOS Shortcuts page, you'll see 6 pre-built templates:

- **Log Alcohol** - Track drinks
- **Log Ice Bath** - Log cold exposure
- **Log Sauna** - Track heat therapy
- **Log TRT 0.10ml** - Log testosterone dose (includes dosage tracking)
- **Log Morning Coffee** - Track caffeine
- **Ate Late** - Log late-night meals

Each template shows a JSON configuration. Pick the one you want to create first.

---

## Step 3: Copy the Template Configuration

1. Find the template you want (e.g., "Log Alcohol")
2. Tap the **Copy Configuration** button
3. The JSON code is now in your clipboard

---

## Step 4: Create the iOS Shortcut

### Open Shortcuts App
1. On your iPhone, open the **Shortcuts** app (blue icon with white shortcuts symbol)
2. Tap the **+** button in the top right corner

### Add the Web Request Action
1. In the search bar at the bottom, type: **Get Contents of URL**
2. Tap the "Get Contents of URL" action to add it
3. Tap **Show More** to expand all options

### Configure the URL
1. In the URL field, enter: `https://get-flo.com/api/life-events`

### Set the Method
1. Tap **Method** → Select **POST**

### Add Headers
1. Tap **Add new header**
2. First header:
   - Key: `Authorization`
   - Value: `Bearer flo_your_actual_api_key_here` (replace with your actual API key from Step 1)
3. Tap **Add new header** again
4. Second header:
   - Key: `Content-Type`
   - Value: `application/json`

### Add Request Body
1. Tap **Request Body** → Select **JSON**
2. Tap in the JSON text area
3. **Delete any existing text**
4. Paste the template configuration you copied in Step 3

---

## Step 5: Name and Add to Home Screen

1. Tap the shortcut name at the top (usually says "Get Contents of URL")
2. Replace it with a descriptive name like:
   - "Log Beer"
   - "Ice Bath"
   - "Morning Coffee"
   - "TRT Dose"
3. Tap the **icon** next to the name to choose a custom icon/color
4. Tap **Done** to save
5. **Long press** on your new shortcut
6. Select **Share** → **Add to Home Screen**
7. Tap **Add** in the top right

---

## Step 6: Test It!

1. Go to your iPhone home screen
2. Find your new shortcut icon
3. Tap it once
4. Open Flō → go to Flō Oracle
5. Ask: "What events have I logged recently?"
6. Your event should appear!

---

## Example: Setting Up "Log Alcohol" Shortcut

Here's the exact configuration for logging a drink:

**URL**: `https://get-flo.com/api/life-events`

**Method**: POST

**Headers**:
```
Authorization: Bearer flo_abc123def456...
Content-Type: application/json
```

**Request Body**:
```json
{
  "eventType": "alcohol",
  "details": {
    "drinks": 1,
    "type": "beer"
  }
}
```

---

## Troubleshooting

### Shortcut doesn't work / No response
- Verify your API key is correct (regenerate if needed)
- Check that `Bearer ` is included before your API key (with a space after)
- Make sure the URL is exactly: `https://get-flo.com/api/life-events`
- Confirm Request Body is set to **JSON** format

### "Unauthorized" error
- Your API key is incorrect or expired
- Go to Flō → Profile → iOS Shortcuts → Regenerate Key
- Update all your shortcuts with the new key

### Event logged but with wrong details
- Check your JSON configuration matches the template
- Make sure there are no typos in the `eventType` field

### Want to customize details?
You can modify the JSON. For example, for alcohol:
```json
{
  "eventType": "alcohol",
  "details": {
    "drinks": 2,          ← Change number
    "type": "wine"        ← Change drink type
  }
}
```

---

## Creating Multiple Shortcuts

Repeat Steps 3-6 for each template you want:
1. Copy different template from Flō website
2. Create new shortcut in iOS
3. Use the **same API key** for all shortcuts
4. Give each a unique name and icon

---

## Security Notes

- Your API key is like a password - keep it secure
- Don't share your API key with anyone
- If compromised, revoke and regenerate it immediately (Flō → Profile → iOS Shortcuts → Revoke Key)
- Each revoke/regenerate requires updating all your shortcuts with the new key

---

## Advanced: Custom Event Types

You can create shortcuts for any of these event types:

- `alcohol` - Track drinks
- `ice_bath` - Cold exposure
- `sauna` - Heat therapy
- `supplements` - Track supplements/medications (supports dosage tracking)
- `caffeine` - Coffee, tea, energy drinks
- `late_meal` - Late-night eating
- `workout` - Exercise sessions
- `stress` - Stressful events
- `breathwork` - Breathing exercises
- `symptoms` - Illness/symptoms
- `health_goal` - Health objectives
- `observation` - General health observations

---

## Need Help?

- Check the iOS Shortcuts page in Flō for your API key status
- Verify your API key was used recently (shows "Last used" timestamp)
- Regenerate your key if you suspect issues
- Apple's official guide: https://support.apple.com/guide/shortcuts/welcome/ios
