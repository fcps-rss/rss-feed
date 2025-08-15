# RSS Feed Aggregator for GitHub Pages

A secure, static RSS feed aggregator that fetches and displays content from multiple RSS feeds using GitHub Actions. Built for GitHub Pages with no CORS issues and built-in pagination.

## Features

- 🚀 **No CORS Issues**: Server-side RSS fetching using GitHub Actions
- 📄 **Pagination**: Built-in pagination for large numbers of articles
- 🔍 **Search & Filter**: Search articles and filter by category
- 📱 **Responsive Design**: Mobile-friendly interface
- 🔒 **Secure**: Content sanitization and XSS protection
- ⚡ **Fast**: Pre-processed static JSON data
- 🔄 **Auto-updates**: Automatic RSS feed updates every 6 hours

## Setup Instructions

### 1. Configure RSS Feeds

Edit `config/feeds.json` to add your RSS feeds:

```json
[
  {
    "name": "Example News",
    "url": "https://example.com/feed.xml",
    "category": "news"
  },
  {
    "name": "Tech Blog",
    "url": "https://techblog.com/rss",
    "category": "technology"
  }
]
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Test Locally

```bash
npm run dev
```

This will build the RSS data and serve it locally at `http://localhost:3000`.

### 4. Deploy to GitHub Pages

1. Push your code to a GitHub repository
2. Go to Settings → Pages
3. Set source to "GitHub Actions"
4. The site will automatically build and deploy

## How It Works

1. **GitHub Actions** runs every 6 hours (configurable)
2. **Fetches RSS feeds** from your configured URLs
3. **Processes and sanitizes** the content
4. **Generates static JSON** files with pagination
5. **Deploys to GitHub Pages** as a static site

## Security Features

- **Content Sanitization**: All HTML content is sanitized to prevent XSS
- **URL Validation**: Only allows HTTP/HTTPS schemes
- **Rate Limiting**: Built-in delays between RSS feed requests
- **Error Handling**: Graceful handling of failed feed requests

## Configuration Options

### Pagination
- Default: 20 items per page
- Modify `ITEMS_PER_PAGE` in `scripts/build-rss.js`

### Update Frequency
- Default: Every 6 hours
- Modify the cron schedule in `.github/workflows/build-rss.yml`

### Content Limits
- Default: 300 characters for descriptions
- Modify `MAX_DESCRIPTION_LENGTH` in `scripts/build-rss.js`

## File Structure

```
├── .github/workflows/build-rss.yml  # GitHub Actions workflow
├── config/feeds.json                # RSS feed configuration
├── scripts/build-rss.js            # Build script
├── css/styles.css                   # Styling
├── dist/                           # Generated static files
├── package.json                    # Dependencies
└── _config.yml                     # Jekyll configuration
```

## Adding More Feeds

To add your 250+ RSS feeds:

1. Edit `config/feeds.json`
2. Add each feed with name, URL, and category
3. The system will automatically handle all feeds on the next build

Example for bulk addition:
```json
[
  {"name": "Feed 1", "url": "https://site1.com/rss", "category": "news"},
  {"name": "Feed 2", "url": "https://site2.com/feed", "category": "tech"},
  ...
]
```

## Performance Considerations

- The build process handles up to 50 articles per feed
- Total build time scales with number of feeds
- Large numbers of feeds may require GitHub Actions timeout adjustments
- Consider categorizing feeds for better organization

## Troubleshooting

### Build Fails
- Check RSS feed URLs are accessible
- Verify JSON syntax in `config/feeds.json`
- Check GitHub Actions logs for specific errors

### Missing Articles
- Some feeds may be temporarily unavailable
- Check feed URL accessibility
- Verify feed format (RSS/Atom)

## License

MIT License - feel free to use and modify for your needs.

This project sets up a simple GitHub Pages site that displays an RSS feed from Aldrin Elementary School. It includes HTML, CSS, and JavaScript files to fetch and render the feed dynamically.

## Project Structure

- `index.html`: The main HTML document for the site.
- `css/styles.css`: Contains styles for the project.
- `js/rss-feed.js`: JavaScript code for fetching and displaying the RSS feed.
- `_config.yml`: Configuration file for GitHub Pages.
- `README.md`: Documentation for the project.

## Setup Instructions

1. Clone the repository to your local machine.
2. Open the project in your preferred code editor.
3. Ensure you have a valid internet connection to fetch the RSS feed.
4. Open `index.html` in a web browser to view the RSS feed.

## Usage

The site will automatically fetch and display the latest news from the Aldrin Elementary School RSS feed. You can customize the styles in `css/styles.css` and modify the JavaScript logic in `js/rss-feed.js` as needed.

## Deployment

To deploy the project on GitHub Pages:

1. Push the code to a GitHub repository.
2. Go to the repository settings.
3. Enable GitHub Pages from the settings and select the branch to serve the site from (usually `main` or `master`).

Your site will be live at `https://<username>.github.io/<repository-name>/`.Last updated: Fri Aug 15 07:55:47 CDT 2025
