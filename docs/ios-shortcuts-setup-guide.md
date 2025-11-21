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
**IMPORTANT**: iOS Shortcuts doesn't let you paste JSON directly. You need to build it field-by-field.

1. Under **Request Body**, tap **Add new field**
2. Select **Dictionary** (this creates a JSON object `{ }`)
3. Add the first field in the dictionary:
   - Tap **Add new field**
   - **Key**: Type `eventType`
   - **Type**: Select **Text**
   - **Value**: Type the event type (e.g., `alcohol`, `ice_bath`, `sauna`, etc.)
4. Add the second field:
   - Tap **Add new field** (in the main dictionary)
   - **Key**: Type `details`
   - **Type**: Select **Dictionary**
5. Now add fields inside the `details` dictionary (varies by template - see examples below)

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

## Detailed Examples: Request Body Configuration

Each template requires different fields in the `details` dictionary. Here's exactly what to enter for each:

### Template 1: Log Alcohol

**Request Body Structure:**
1. Tap **Add new field** → **Dictionary**
2. Inside the main dictionary:
   - Field 1: Key=`eventType`, Type=**Text**, Value=`alcohol`
   - Field 2: Key=`details`, Type=**Dictionary**
3. Inside the `details` dictionary:
   - Field 1: Key=`drinks`, Type=**Number**, Value=`1`
   - Field 2: Key=`type`, Type=**Text**, Value=`beer`

### Template 2: Log Ice Bath

**Request Body Structure:**
1. Tap **Add new field** → **Dictionary**
2. Inside the main dictionary:
   - Field 1: Key=`eventType`, Type=**Text**, Value=`ice_bath`
   - Field 2: Key=`details`, Type=**Dictionary**
3. Inside the `details` dictionary:
   - Field 1: Key=`duration_min`, Type=**Number**, Value=`3`
   - Field 2: Key=`temp_c`, Type=**Number**, Value=`7`

### Template 3: Log Sauna

**Request Body Structure:**
1. Tap **Add new field** → **Dictionary**
2. Inside the main dictionary:
   - Field 1: Key=`eventType`, Type=**Text**, Value=`sauna`
   - Field 2: Key=`details`, Type=**Dictionary**
3. Inside the `details` dictionary:
   - Field 1: Key=`duration_min`, Type=**Number**, Value=`15`

### Template 4: Log TRT 0.10ml (with dosage tracking)

**Request Body Structure:**
1. Tap **Add new field** → **Dictionary**
2. Inside the main dictionary:
   - Field 1: Key=`eventType`, Type=**Text**, Value=`supplements`
   - Field 2: Key=`details`, Type=**Dictionary**
3. Inside the `details` dictionary:
   - Field 1: Key=`names`, Type=**Array**
     - Inside the array, tap **Add new item** → **Text**, Value=`Testosterone`
   - Field 2: Key=`dosage`, Type=**Dictionary**
     - Inside the `dosage` dictionary:
       - Field 1: Key=`amount`, Type=**Number**, Value=`0.10`
       - Field 2: Key=`unit`, Type=**Text**, Value=`ml`

### Template 5: Log Morning Coffee

**Request Body Structure:**
1. Tap **Add new field** → **Dictionary**
2. Inside the main dictionary:
   - Field 1: Key=`eventType`, Type=**Text**, Value=`caffeine`
   - Field 2: Key=`details`, Type=**Dictionary**
3. Inside the `details` dictionary:
   - Field 1: Key=`source`, Type=**Text**, Value=`coffee`
   - Field 2: Key=`cups`, Type=**Number**, Value=`1`

### Template 6: Ate Late

**Request Body Structure:**
1. Tap **Add new field** → **Dictionary**
2. Inside the main dictionary:
   - Field 1: Key=`eventType`, Type=**Text**, Value=`late_meal`
   - Field 2: Key=`details`, Type=**Dictionary**
3. Inside the `details` dictionary:
   - Field 1: Key=`hour`, Type=**Number**, Value=`22`

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
