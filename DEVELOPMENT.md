# TPS-Calendar-Base Development Guide

This guide provides instructions for setting up and developing the TPS-Calendar-Base plugin for Obsidian.

## Development Environment Setup

1.  **Prerequisites:**
    *   [Node.js](https://nodejs.org/) (v16 or higher)
    *   [npm](https://www.npmjs.com/)

2.  **Install Dependencies:**
    Navigate to the plugin directory and install the required dependencies:
    ```bash
    npm install
    ```

## Building the Plugin

*   **For Development:**
    To watch for file changes and automatically rebuild the plugin for testing in Obsidian, run:
    ```bash
    npm run dev
    ```

*   **For Production:**
    To build the plugin for production, which compiles and bundles the necessary files, run:
    ```bash
    npm run build
    ```
    The build output will be placed in the `build/` directory.

## Deploying the Plugin

To test the plugin in Obsidian, copy the entire `build/` directory into your Obsidian vault's `.obsidian/plugins/` directory. You can rename the copied folder to `TPS-calendar-base` or any other name. After copying, reload Obsidian and enable the plugin in the settings.
