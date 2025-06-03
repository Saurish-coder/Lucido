# Task Relevance Checker Chrome Extension

This Chrome extension uses the Google AI (Gemini) SDK to check if a website is relevant to the task you're trying to accomplish.

## Features

- Checks if the current website is relevant to your specified task
- Uses Gemini AI API to analyze the relevance
- Simple and user-friendly interface

## Setup Instructions

1. Download or clone this repository
2. Create icon images:
   - Create PNG icons in the `/icons` folder with names:
     - `icon16.png` (16x16 pixels)
     - `icon48.png` (48x48 pixels)
     - `icon128.png` (128x128 pixels)
   - You can use any image editor to create these icons

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" by clicking the toggle in the top-right corner
   - Click "Load unpacked" and select the folder containing this extension

## Usage

1. Click on the extension icon in your browser toolbar
2. Enter the task you're trying to accomplish
3. Click "Check Relevance"
4. The extension will display "Allowed" or "Denied" based on whether the current website is relevant to your task

## Technical Details

- Uses Chrome Extension Manifest V3
- Implements the Google AI JavaScript SDK for Gemini API integration
- Uses the gemini-1.5-flash model for efficient responses
- Requires an active internet connection to function

## Note

The Gemini API key is included in the background script. For production use, it's recommended to implement a more secure way to handle API keys, such as using Vertex AI in Firebase. 