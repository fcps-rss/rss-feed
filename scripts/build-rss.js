const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const sanitizeHtml = require('sanitize-html');

// Load RSS feeds from config file
const RSS_FEEDS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'feeds.json'), 'utf8'));

const ITEMS_PER_PAGE = 20;
const MAX_DESCRIPTION_LENGTH = 300;

const sanitizeConfig = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li'],
  allowedAttributes: {
    'a': ['href', 'target']
  },
  allowedSchemes: ['http', 'https', 'mailto']
};

const ensureDistDirectory = () => {
  const distDir = path.join(__dirname, '..', 'dist');
  const dataDir = path.join(distDir, 'data');
  
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  return { distDir, dataDir };
};

const fetchRSSFeed = async (feedConfig) => {
  try {
    console.log(`Fetching: ${feedConfig.name}...`);
    
    const response = await fetch(feedConfig.url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader Bot)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const rssText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rssText, 'text/xml');
    
    // Check for parsing errors
    const parseErrors = xmlDoc.getElementsByTagName('parsererror');
    if (parseErrors.length > 0) {
      throw new Error('XML parsing error');
    }
    
    const items = xmlDoc.getElementsByTagName('item');
    const channel = xmlDoc.getElementsByTagName('channel')[0];
    
    const feedTitle = channel?.getElementsByTagName('title')[0]?.textContent || feedConfig.name;
    const feedDescription = channel?.getElementsByTagName('description')[0]?.textContent || '';
    const feedLink = channel?.getElementsByTagName('link')[0]?.textContent || '';
    
    const parsedItems = Array.from(items).slice(0, 50).map(item => {
      const title = item.getElementsByTagName('title')[0]?.textContent || 'No Title';
      const link = item.getElementsByTagName('link')[0]?.textContent || '#';
      let description = item.getElementsByTagName('description')[0]?.textContent || '';
      const pubDate = item.getElementsByTagName('pubDate')[0]?.textContent || '';
      const guid = item.getElementsByTagName('guid')[0]?.textContent || link;
      
      // Clean and sanitize description
      description = description.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
      description = sanitizeHtml(description, sanitizeConfig);
      
      // Truncate description
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
      }
      
      return {
        id: Buffer.from(guid).toString('base64').substring(0, 16),
        title: sanitizeHtml(title, { allowedTags: [] }),
        link: link,
        description: description,
        pubDate: pubDate,
        timestamp: pubDate ? new Date(pubDate).getTime() : 0,
        feedName: feedConfig.name,
        category: feedConfig.category || 'general',
        feedSource: feedLink
      };
    });
    
    return {
      feedConfig,
      feedInfo: {
        title: feedTitle,
        description: feedDescription,
        link: feedLink
      },
      items: parsedItems.filter(item => item.timestamp > 0) // Only include items with valid dates
    };
    
  } catch (error) {
    console.error(`Error fetching ${feedConfig.name}:`, error.message);
    return {
      feedConfig,
      feedInfo: {
        title: feedConfig.name,
        description: '',
        link: ''
      },
      items: [],
      error: error.message
    };
  }
};

const buildStaticSite = async () => {
  try {
    console.log('Starting RSS feed build process...');
    
    const { distDir, dataDir } = ensureDistDirectory();
    
    // Fetch all RSS feeds
    const feedPromises = RSS_FEEDS.map(feedConfig => fetchRSSFeed(feedConfig));
    const feedResults = await Promise.all(feedPromises);
    
    // Combine all items and sort by date
    let allItems = [];
    const feedSummary = [];
    
    feedResults.forEach(result => {
      allItems = allItems.concat(result.items.map(item => ({
        ...item,
        feedInfo: result.feedInfo
      })));
      
      feedSummary.push({
        name: result.feedConfig.name,
        category: result.feedConfig.category,
        itemCount: result.items.length,
        error: result.error || null,
        lastUpdated: new Date().toISOString(),
        feedInfo: result.feedInfo
      });
    });
    
    // Sort by date (newest first)
    allItems.sort((a, b) => b.timestamp - a.timestamp);
    
    // Create pagination
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
    const pages = [];
    
    for (let i = 0; i < totalPages; i++) {
      const start = i * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const pageItems = allItems.slice(start, end);
      
      const pageData = {
        page: i + 1,
        totalPages,
        totalItems: allItems.length,
        itemsPerPage: ITEMS_PER_PAGE,
        items: pageItems,
        hasNext: i < totalPages - 1,
        hasPrev: i > 0
      };
      
      pages.push(pageData);
      
      // Save individual page data
      fs.writeFileSync(
        path.join(dataDir, `page-${i + 1}.json`),
        JSON.stringify(pageData, null, 2)
      );
    }
    
    // Save metadata
    const metadata = {
      totalFeeds: RSS_FEEDS.length,
      totalItems: allItems.length,
      totalPages,
      itemsPerPage: ITEMS_PER_PAGE,
      lastUpdated: new Date().toISOString(),
      categories: [...new Set(allItems.map(item => item.category))],
      feeds: feedSummary
    };
    
    fs.writeFileSync(
      path.join(dataDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // Copy static assets
    const cssSource = path.join(__dirname, '..', 'css', 'styles.css');
    const cssTarget = path.join(distDir, 'css', 'styles.css');
    
    if (!fs.existsSync(path.dirname(cssTarget))) {
      fs.mkdirSync(path.dirname(cssTarget), { recursive: true });
    }
    
    fs.copyFileSync(cssSource, cssTarget);
    
    // Generate main HTML file
    const html = generateMainHTML(metadata);
    fs.writeFileSync(path.join(distDir, 'index.html'), html);
    
    // Generate JavaScript file
    const jsContent = generateAppJS();
    const jsTarget = path.join(distDir, 'js', 'app.js');
    
    if (!fs.existsSync(path.dirname(jsTarget))) {
      fs.mkdirSync(path.dirname(jsTarget), { recursive: true });
    }
    
    fs.writeFileSync(jsTarget, jsContent);
    
    console.log(`Build completed successfully!`);
    console.log(`- Total feeds: ${metadata.totalFeeds}`);
    console.log(`- Total items: ${metadata.totalItems}`);
    console.log(`- Total pages: ${metadata.totalPages}`);
    console.log(`- Last updated: ${metadata.lastUpdated}`);
    
  } catch (error) {
    console.error('Build process failed:', error);
    process.exit(1);
  }
};

const generateMainHTML = (metadata) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RSS Feed Aggregator</title>
    <link rel="stylesheet" href="css/styles.css">
    <meta name="description" content="Aggregated RSS feeds from ${metadata.totalFeeds} sources">
</head>
<body>
    <div class="rss-feed-container">
        <header class="rss-feed-header">
            <h1>RSS Feed Aggregator</h1>
            <p class="rss-feed-description">
                Latest news from ${metadata.totalFeeds} sources • 
                ${metadata.totalItems} articles • 
                Last updated: <span id="last-updated"></span>
            </p>
            <div class="filter-controls">
                <select id="category-filter">
                    <option value="all">All Categories</option>
                </select>
                <input type="search" id="search-input" placeholder="Search articles...">
            </div>
        </header>
        
        <main>
            <div id="loading" class="rss-loading">Loading articles...</div>
            <div id="error" class="rss-error" style="display: none;"></div>
            <div id="rss-items" class="rss-items"></div>
            
            <nav id="pagination" class="pagination" style="display: none;">
                <button id="prev-btn" class="pagination-btn">Previous</button>
                <span id="page-info" class="page-info"></span>
                <button id="next-btn" class="pagination-btn">Next</button>
            </nav>
        </main>
    </div>
    
    <script src="js/app.js"></script>
</body>
</html>`;
};

const generateAppJS = () => {
  return `class RSSFeedApp {
    constructor() {
        this.currentPage = 1;
        this.metadata = null;
        this.currentCategory = 'all';
        this.searchQuery = '';
        this.filteredItems = [];
        
        this.init();
    }
    
    async init() {
        try {
            await this.loadMetadata();
            this.setupEventListeners();
            this.populateCategoryFilter();
            this.updateLastUpdated();
            await this.loadPage(1);
        } catch (error) {
            this.showError('Failed to initialize application: ' + error.message);
        }
    }
    
    async loadMetadata() {
        const response = await fetch('data/metadata.json');
        if (!response.ok) throw new Error('Failed to load metadata');
        this.metadata = await response.json();
    }
    
    populateCategoryFilter() {
        const categoryFilter = document.getElementById('category-filter');
        this.metadata.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            categoryFilter.appendChild(option);
        });
    }
    
    updateLastUpdated() {
        const lastUpdatedEl = document.getElementById('last-updated');
        const date = new Date(this.metadata.lastUpdated);
        lastUpdatedEl.textContent = date.toLocaleString();
    }
    
    setupEventListeners() {
        document.getElementById('prev-btn').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.loadPage(this.currentPage - 1);
            }
        });
        
        document.getElementById('next-btn').addEventListener('click', () => {
            if (this.currentPage < this.metadata.totalPages) {
                this.loadPage(this.currentPage + 1);
            }
        });
        
        document.getElementById('category-filter').addEventListener('change', (e) => {
            this.currentCategory = e.target.value;
            this.applyFilters();
        });
        
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.applyFilters();
        });
    }
    
    async loadPage(pageNum) {
        try {
            document.getElementById('loading').style.display = 'block';
            document.getElementById('error').style.display = 'none';
            
            const response = await fetch(\`data/page-\${pageNum}.json\`);
            if (!response.ok) throw new Error('Failed to load page data');
            
            const pageData = await response.json();
            this.currentPage = pageNum;
            
            this.renderItems(pageData.items);
            this.updatePagination(pageData);
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
        } catch (error) {
            this.showError('Failed to load page: ' + error.message);
        } finally {
            document.getElementById('loading').style.display = 'none';
        }
    }
    
    async applyFilters() {
        // For simplicity, reload current page and filter client-side
        // In a more advanced version, you could pre-generate filtered pages
        try {
            const response = await fetch(\`data/page-\${this.currentPage}.json\`);
            const pageData = await response.json();
            
            let filteredItems = pageData.items;
            
            // Apply category filter
            if (this.currentCategory !== 'all') {
                filteredItems = filteredItems.filter(item => 
                    item.category === this.currentCategory
                );
            }
            
            // Apply search filter
            if (this.searchQuery) {
                filteredItems = filteredItems.filter(item =>
                    item.title.toLowerCase().includes(this.searchQuery) ||
                    item.description.toLowerCase().includes(this.searchQuery) ||
                    item.feedName.toLowerCase().includes(this.searchQuery)
                );
            }
            
            this.renderItems(filteredItems);
            
        } catch (error) {
            this.showError('Failed to apply filters: ' + error.message);
        }
    }
    
    renderItems(items) {
        const container = document.getElementById('rss-items');
        
        if (items.length === 0) {
            container.innerHTML = '<p class="no-results">No articles found matching your criteria.</p>';
            return;
        }
        
        const html = items.map(item => \`
            <article class="rss-item">
                <header class="rss-item-header">
                    <h2 class="rss-item-title">
                        <a href="\${item.link}" target="_blank" rel="noopener noreferrer">\${item.title}</a>
                    </h2>
                    <div class="rss-item-meta">
                        <time class="rss-item-date">\${this.formatDate(item.pubDate)}</time>
                        <span class="rss-item-source">\${item.feedName}</span>
                        <span class="rss-item-category">\${item.category}</span>
                    </div>
                </header>
                <div class="rss-item-content">
                    \${item.description}
                </div>
            </article>
        \`).join('');
        
        container.innerHTML = html;
    }
    
    updatePagination(pageData) {
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const pageInfo = document.getElementById('page-info');
        
        pageInfo.textContent = \`Page \${pageData.page} of \${pageData.totalPages}\`;
        
        prevBtn.disabled = !pageData.hasPrev;
        nextBtn.disabled = !pageData.hasNext;
        
        pagination.style.display = 'flex';
    }
    
    formatDate(dateString) {
        if (!dateString) return 'Unknown date';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    showError(message) {
        const errorEl = document.getElementById('error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        document.getElementById('loading').style.display = 'none';
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RSSFeedApp();
});`;
};

// Export for potential testing
if (require.main === module) {
    buildStaticSite();
}

module.exports = { buildStaticSite, fetchRSSFeed };
