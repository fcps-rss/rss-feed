const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const sanitizeHtml = require('sanitize-html');

// Load FCPS feeds from config file
const FCPS_FEEDS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'feeds.json'), 'utf8'));

const ITEMS_PER_PAGE = 15; // Good size for all feeds
const MAX_DESCRIPTION_LENGTH = 250;

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

const fetchRSSFeed = async (feedConfig, index, total) => {
  try {
    console.log(`[${index + 1}/${total}] Fetching: ${feedConfig.name}...`);
    
    const response = await fetch(feedConfig.url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FCPS RSS Reader Bot)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const rssText = await response.text();
    const parser = new DOMParser({
      errorHandler: {
        warning: () => {},
        error: () => {},
        fatalError: (error) => console.warn(`XML Parse Error for ${feedConfig.name}:`, error)
      }
    });
    
    const xmlDoc = parser.parseFromString(rssText, 'text/xml');
    
    const items = xmlDoc.getElementsByTagName('item');
    const channel = xmlDoc.getElementsByTagName('channel')[0];
    
    const feedTitle = channel?.getElementsByTagName('title')[0]?.textContent || feedConfig.name;
    const feedDescription = channel?.getElementsByTagName('description')[0]?.textContent || '';
    const feedLink = channel?.getElementsByTagName('link')[0]?.textContent || '';
    
    const parsedItems = Array.from(items).slice(0, 30).map(item => {
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
      
      const timestamp = pubDate ? new Date(pubDate).getTime() : Date.now() - Math.random() * 86400000; // Random within last day if no date
      
      return {
        id: Buffer.from(guid + feedConfig.name).toString('base64').substring(0, 16),
        title: sanitizeHtml(title, { allowedTags: [] }),
        link: link,
        description: description,
        pubDate: pubDate,
        timestamp: timestamp,
        feedName: feedConfig.name,
        category: feedConfig.category || 'general',
        feedSource: feedLink
      };
    });
    
    console.log(`   ✅ ${parsedItems.length} articles from ${feedConfig.name}`);
    
    return {
      feedConfig,
      feedInfo: {
        title: feedTitle,
        description: feedDescription,
        link: feedLink
      },
      items: parsedItems.filter(item => item.timestamp > 0)
    };
    
  } catch (error) {
    console.error(`   ❌ Error fetching ${feedConfig.name}: ${error.message}`);
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

const buildFCPSSite = async () => {
  try {
    console.log('🏫 Starting FCPS RSS Feed Build...');
    console.log(`📊 Processing ${FCPS_FEEDS.length} FCPS school feeds\n`);
    
    const { distDir, dataDir } = ensureDistDirectory();
    
    // Fetch all FCPS RSS feeds with progress tracking
    const feedResults = [];
    for (let i = 0; i < FCPS_FEEDS.length; i++) {
      const result = await fetchRSSFeed(FCPS_FEEDS[i], i, FCPS_FEEDS.length);
      feedResults.push(result);
      
      // Add delay between requests to be respectful
      if (i < FCPS_FEEDS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log('\n📝 Processing articles...');
    
    // Combine all items and sort by date
    let allItems = [];
    const feedSummary = [];
    let totalArticles = 0;
    let successfulFeeds = 0;
    
    feedResults.forEach(result => {
      const items = result.items.map(item => ({
        ...item,
        feedInfo: result.feedInfo
      }));
      
      allItems = allItems.concat(items);
      totalArticles += items.length;
      
      if (items.length > 0) {
        successfulFeeds++;
      }
      
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
    
    console.log(`📄 Creating pagination (${ITEMS_PER_PAGE} items per page)...`);
    
    // Create pagination
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
    
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
      
      // Save individual page data
      fs.writeFileSync(
        path.join(dataDir, `page-${i + 1}.json`),
        JSON.stringify(pageData, null, 2)
      );
    }
    
    // Save metadata
    const categories = [...new Set(allItems.map(item => item.category))];
    const metadata = {
      totalFeeds: FCPS_FEEDS.length,
      successfulFeeds: successfulFeeds,
      totalItems: allItems.length,
      totalPages,
      itemsPerPage: ITEMS_PER_PAGE,
      lastUpdated: new Date().toISOString(),
      categories: categories,
      feeds: feedSummary
    };
    
    fs.writeFileSync(
      path.join(dataDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    console.log('🎨 Copying assets...');
    
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
    
    console.log('\n🎉 FCPS RSS Build Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Build Statistics:`);
    console.log(`   • Total FCPS feeds: ${metadata.totalFeeds}`);
    console.log(`   • Successful feeds: ${metadata.successfulFeeds}`);
    console.log(`   • Failed feeds: ${metadata.totalFeeds - metadata.successfulFeeds}`);
    console.log(`   • Total articles: ${metadata.totalItems}`);
    console.log(`   • Total pages: ${metadata.totalPages}`);
    console.log(`   • Categories: ${categories.join(', ')}`);
    console.log(`   • Last updated: ${metadata.lastUpdated}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Run "npm run serve" to view at http://localhost:3000');
    
  } catch (error) {
    console.error('❌ FCPS build failed:', error);
    process.exit(1);
  }
};

const generateMainHTML = (metadata) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fairfax County Public Schools News</title>
    <link rel="stylesheet" href="css/styles.css">
    <meta name="description" content="Latest news from ${metadata.totalFeeds} FCPS schools and district offices">
    <meta name="keywords" content="FCPS, Fairfax County Public Schools, school news, education">
</head>
<body>
    <div class="rss-feed-container">
        <header class="rss-feed-header">
            <h1>FCPS News Central</h1>
            <p class="rss-feed-description">
                🏫 <strong>Fairfax County Public Schools</strong> News Aggregator<br>
                ${metadata.successfulFeeds}/${metadata.totalFeeds} active feeds • 
                ${metadata.totalItems} articles • 
                Last updated: <span id="last-updated"></span>
            </p>
            <div class="filter-controls">
                <select id="category-filter">
                    <option value="all">All School Types</option>
                </select>
                <input type="search" id="search-input" placeholder="Search schools, articles, or keywords...">
            </div>
        </header>
        
        <main>
            <div id="loading" class="rss-loading">Loading FCPS articles...</div>
            <div id="error" class="rss-error" style="display: none;"></div>
            <div id="rss-items" class="rss-items"></div>
            
            <nav id="pagination" class="pagination" style="display: none;">
                <button id="prev-btn" class="pagination-btn">← Previous</button>
                <span id="page-info" class="page-info"></span>
                <button id="next-btn" class="pagination-btn">Next →</button>
            </nav>
        </main>
        
        <footer style="text-align: center; padding: 20px; color: #666; border-top: 1px solid #eee; margin-top: 40px;">
            <p>Fairfax County Public Schools News Aggregator • Built with ❤️ for the FCPS Community</p>
        </footer>
    </div>
    
    <script src="js/app.js"></script>
</body>
</html>`;
};

const generateAppJS = () => {
  return `class FCPSFeedApp {
    constructor() {
        this.currentPage = 1;
        this.metadata = null;
        this.currentCategory = 'all';
        this.searchQuery = '';
        
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
            const categoryName = this.getCategoryDisplayName(category);
            option.textContent = categoryName;
            categoryFilter.appendChild(option);
        });
    }
    
    getCategoryDisplayName(category) {
        const categoryMap = {
            'elementary': 'Elementary Schools',
            'middle': 'Middle Schools', 
            'high': 'High Schools',
            'district': 'District News',
            'academy': 'Academies',
            'career': 'Career Centers',
            'special': 'Special Programs',
            'school': 'Schools (General)'
        };
        return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1);
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
            this.loadPage(1); // Reset to first page when filtering
        });
        
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.loadPage(1); // Reset to first page when searching
            }, 300);
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
            
            // Apply filters
            let filteredItems = pageData.items;
            
            if (this.currentCategory !== 'all') {
                filteredItems = filteredItems.filter(item => 
                    item.category === this.currentCategory
                );
            }
            
            if (this.searchQuery) {
                filteredItems = filteredItems.filter(item =>
                    item.title.toLowerCase().includes(this.searchQuery) ||
                    item.description.toLowerCase().includes(this.searchQuery) ||
                    item.feedName.toLowerCase().includes(this.searchQuery)
                );
            }
            
            this.renderItems(filteredItems);
            this.updatePagination(pageData);
            
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
        } catch (error) {
            this.showError('Failed to load page: ' + error.message);
        } finally {
            document.getElementById('loading').style.display = 'none';
        }
    }
    
    renderItems(items) {
        const container = document.getElementById('rss-items');
        
        if (items.length === 0) {
            const noResultsMsg = this.currentCategory !== 'all' || this.searchQuery 
                ? 'No articles found matching your search criteria.' 
                : 'No articles available.';
            container.innerHTML = \`<p class="no-results">\${noResultsMsg}</p>\`;
            return;
        }
        
        const html = items.map(item => \`
            <article class="rss-item">
                <header class="rss-item-header">
                    <h2 class="rss-item-title">
                        <a href="\${item.link}" target="_blank" rel="noopener noreferrer">\${this.escapeHtml(item.title)}</a>
                    </h2>
                    <div class="rss-item-meta">
                        <time class="rss-item-date">\${this.formatDate(item.pubDate)}</time>
                        <span class="rss-item-source">\${this.escapeHtml(item.feedName)}</span>
                        <span class="rss-item-category">\${this.getCategoryDisplay(item.category)}</span>
                    </div>
                </header>
                <div class="rss-item-content">
                    \${item.description}
                </div>
            </article>
        \`).join('');
        
        container.innerHTML = html;
    }
    
    getCategoryDisplay(category) {
        const categoryMap = {
            'elementary': 'Elementary',
            'middle': 'Middle School', 
            'high': 'High School',
            'district': 'District',
            'academy': 'Academy',
            'career': 'Career Center',
            'special': 'Special Program',
            'school': 'School'
        };
        return categoryMap[category] || category;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    updatePagination(pageData) {
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const pageInfo = document.getElementById('page-info');
        
        pageInfo.textContent = \`Page \${pageData.page} of \${pageData.totalPages} • \${pageData.totalItems} articles\`;
        
        prevBtn.disabled = !pageData.hasPrev;
        nextBtn.disabled = !pageData.hasNext;
        
        pagination.style.display = 'flex';
    }
    
    formatDate(dateString) {
        if (!dateString) return 'Recently';
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return \`\${diffDays} days ago\`;
            
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return 'Recently';
        }
    }
    
    showError(message) {
        const errorEl = document.getElementById('error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        document.getElementById('loading').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FCPSFeedApp();
});`;
};

buildFCPSSite();
