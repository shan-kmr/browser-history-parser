# Rex: Reading Experience Extension

Rex is a powerful browser extension that helps you track your online reading habits, analyze content, and generate insightful summaries using OpenAI's GPT models. It provides valuable statistics about your browsing patterns and extracts key insights from the web pages you visit.

## Features

### Content Analysis and Insights
- **AI-Powered Reading Insights**: Automatically extracts key insights from web pages using OpenAI's GPT-4o
- **External Knowledge Enhancement**: Combines page content with GPT's knowledge for more comprehensive insights
- **Category Classification**: Organizes insights into categories (Technology, Business, Science, Health, Education, Entertainment)
- **Collapsible Insight Groups**: View insights organized by source webpage with expandable sections

### Time Tracking and Analytics
- **Browsing Time Statistics**: Tracks time spent on different websites
- **Spider Chart Visualization**: Visual representation of time spent across different content categories
- **Detailed History**: Maintains a browsing history with time spent on each page
- **Statistics Dashboard**: View your total browsing time, average time per site, and most visited domains

### Modes and Settings
- **Always On Mode**: Toggle to automatically analyze all web pages you visit
- **Manual Analysis**: Button to analyze the current page on demand
- **Force Refresh**: Re-analyze pages even if insights already exist
- **Data Export**: Export your browsing history and statistics to CSV

## Setup and Configuration

### Installation
1. Download the extension files
2. Load the extension in developer mode in your browser:
   - Open Chrome/Edge and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the extension directory

### OpenAI API Key Setup
1. Click on the "Reading Insights" tab in the extension popup
2. Enter your OpenAI API key in the input field
3. Click "Save API Key"
4. Your key is securely stored locally and only used for API calls to OpenAI

> **Important**: You must have a valid OpenAI API key with access to GPT-4o. API calls will be billed to your OpenAI account based on their pricing.

## Usage Guide

### Basic Navigation
- Click the extension icon to open the popup
- Navigate between tabs to access different features:
  - **History**: View your browsing history with time statistics
  - **Time Stats**: See detailed time spent analysis
  - **Reading Insights**: Access AI-generated insights from web pages

### Analyzing Web Pages
- **Manual Analysis**:
  1. Navigate to a web page you want to analyze
  2. Click the extension icon to open the popup
  3. Click "Analyze this page" to extract insights

- **Automatic Analysis**:
  1. Enable the "Always analyze pages" toggle
  2. Browse normally and Rex will automatically analyze all pages you visit
  3. Check the "Reading Insights" tab to view collected insights

### Reading Insights Features
- **Spider Chart**: Visual representation of your reading patterns by category
- **Category Filters**: Click on category buttons to filter insights
- **Search**: Use the search box to find specific insights
- **Refresh**: Force a new analysis of the current page with the "Refresh" button
- **Clear All**: Remove all reading insights with the "Clear All" button

### Time Statistics
- View breakdowns of time spent by domain
- See your total browsing time across all sites
- Identify your most visited domains and categories

## Privacy and Data Storage
- All data is stored locally in your browser
- No data is sent to external servers except for content sent to OpenAI for analysis
- Your API key is stored securely in your browser's local storage
- You can clear all stored data at any time using the clear buttons

## Troubleshooting
- If insights aren't being generated, check that your API key is valid
- If the extension isn't tracking time correctly, try refreshing the page
- If you encounter errors, check the browser console for more details

## Technical Details
- The extension uses Chrome's storage API to maintain browsing data
- Time tracking is performed while pages are active and visible
- Content is extracted from pages using DOM traversal techniques
- OpenAI's GPT-4o model is used for content analysis

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request 