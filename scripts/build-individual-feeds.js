const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const sanitizeHtml = require('sanitize-html');

// Load feed configuration
const FEEDS_CONFIG = require('../config/feeds.json');
const ITEMS_PER_FEED_PAGE = 20;
const MAX_DESCRIPTION_LENGTH = 300;

const sanitizeConfig = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li'],
  allowedAttributes: {
    'a': ['href', 'target']
  },
  allowedSchemes: ['http', 'https', 'mailto']
};

// Create URL-safe slug from feed name
const createSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single
    .trim('-');               // Remove leading/trailing hyphens
};

const ensureDirectories = () => {
  const distDir = path.join(__dirname, '..', 'dist');
  const feedsDir = path.join(distDir, 'feeds');
  const cssDir = path.join(distDir, 'css');
  const jsDir = path.join(distDir, 'js');
  
  [distDir, feedsDir, cssDir, jsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  return { distDir, feedsDir, cssDir, jsDir };
};

const fetchRSSFeed = async (feedConfig) => {
  try {
    console.log(`Fetching: ${feedConfig.name}...`);
    
    const response = await fetch(feedConfig.url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FCPS RSS Aggregator)'
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
        fatalError: (error) => console.warn('XML Parse Error:', error)
      }
    });
    
    const xmlDoc = parser.parseFromString(rssText, 'text/xml');
    const items = xmlDoc.getElementsByTagName('item');
    const channel = xmlDoc.getElementsByTagName('channel')[0];
    
    const feedTitle = channel?.getElementsByTagName('title')[0]?.textContent || feedConfig.name;
    const feedDescription = channel?.getElementsByTagName('description')[0]?.textContent || '';
    const feedLink = channel?.getElementsByTagName('link')[0]?.textContent || '';
    
    const parsedItems = Array.from(items).slice(0, ITEMS_PER_FEED_PAGE).map(item => {
      const title = item.getElementsByTagName('title')[0]?.textContent || 'No Title';
      const link = item.getElementsByTagName('link')[0]?.textContent || '#';
      let description = item.getElementsByTagName('description')[0]?.textContent || '';
      const pubDate = item.getElementsByTagName('pubDate')[0]?.textContent || '';
      const guid = item.getElementsByTagName('guid')[0]?.textContent || link;
      
      // Clean and sanitize description
      description = description.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
      description = sanitizeHtml(description, sanitizeConfig);
      
      // Truncate description for individual feed pages
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
      }
      
      const timestamp = pubDate ? new Date(pubDate).getTime() : Date.now();
      
      return {
        id: Buffer.from(guid + feedConfig.name).toString('base64').substring(0, 16),
        title: sanitizeHtml(title, { allowedTags: [] }),
        link: link,
        description: description,
        pubDate: pubDate,
        timestamp: timestamp,
        feedName: feedConfig.name,
        category: feedConfig.category
      };
    });
    
    console.log(`✅ Got ${parsedItems.length} articles from ${feedConfig.name}`);
    
    return {
      feedConfig,
      feedInfo: {
        title: feedTitle,
        description: feedDescription,
        link: feedLink,
        slug: createSlug(feedConfig.name),
        category: feedConfig.category
      },
      items: parsedItems.filter(item => item.timestamp > 0),
      success: true
    };
    
  } catch (error) {
    console.error(`❌ Error fetching ${feedConfig.name}:`, error.message);
    return {
      feedConfig,
      feedInfo: {
        title: feedConfig.name,
        description: '',
        link: '',
        slug: createSlug(feedConfig.name),
        category: feedConfig.category
      },
      items: [],
      error: error.message,
      success: false
    };
  }
};

const generateIndividualFeedHTML = (feedResult) => {
  const { feedInfo, items } = feedResult;
  const categoryDisplay = {
    'elementary': 'Elementary School',
    'middle': 'Middle School',
    'high': 'High School',
    'district': 'District News',
    'academy': 'Academy',
    'career': 'Career Center',
    'special': 'Special Program'
  }[feedInfo.category] || feedInfo.category;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${feedInfo.title} - FCPS News</title>
    <link rel="stylesheet" href="../../css/styles.css">
    <meta name="description" content="${feedInfo.description}">
    <link rel="canonical" href="https://yourdomain.github.io/feeds/${feedInfo.slug}/">
</head>
<body>
    <div class="rss-feed-container">
        <header class="rss-feed-header">
            <nav class="breadcrumb">
                <a href="../../">← All FCPS News</a> • 
                <a href="../">All Feeds</a> • 
                <span>${categoryDisplay}</span>
            </nav>
            <h1>${feedInfo.title}</h1>
            <p class="rss-feed-description">
                ${feedInfo.description}
                <br>
                <strong>${items.length} recent articles</strong> • 
                <span class="category-badge">${categoryDisplay}</span>
            </p>
            ${feedInfo.link ? `<p><a href="${feedInfo.link}" target="_blank" rel="noopener">Visit Official Site →</a></p>` : ''}
        </header>
        
        <main>
            <div class="rss-items">
                ${items.map(item => `
                    <article class="rss-item">
                        <header class="rss-item-header">
                            <h2 class="rss-item-title">
                                <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
                            </h2>
                            <div class="rss-item-meta">
                                <time class="rss-item-date">${formatDate(item.pubDate)}</time>
                            </div>
                        </header>
                        <div class="rss-item-content">
                            ${item.description}
                        </div>
                    </article>
                `).join('')}
            </div>
            
            ${items.length === 0 ? '<p class="no-results">No articles available at this time.</p>' : ''}
        </main>
        
        <footer style="text-align: center; margin-top: 2rem; padding: 1rem; border-top: 1px solid #eee;">
            <p><a href="../../">← Back to All FCPS News</a></p>
        </footer>
    </div>
</body>
</html>`;
};

const generateFeedDirectoryHTML = (allFeeds) => {
  const feedsByCategory = {};
  
  allFeeds.forEach(feed => {
    const category = feed.feedInfo.category;
    if (!feedsByCategory[category]) {
      feedsByCategory[category] = [];
    }
    feedsByCategory[category].push(feed);
  });

  const categoryDisplayNames = {
    'elementary': 'Elementary Schools',
    'middle': 'Middle Schools',
    'high': 'High Schools',
    'district': 'District News',
    'academy': 'Academies',
    'career': 'Career Centers',
    'special': 'Special Programs'
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>All FCPS Feeds - Individual Feed Directory</title>
    <link rel="stylesheet" href="../css/styles.css">
    <meta name="description" content="Browse ${allFeeds.length} individual FCPS school and district RSS feeds">
</head>
<body>
    <div class="rss-feed-container">
        <header class="rss-feed-header">
            <nav class="breadcrumb">
                <a href="../">← All FCPS News</a>
            </nav>
            <h1>Individual FCPS Feeds</h1>
            <p class="rss-feed-description">
                Browse ${allFeeds.length} individual RSS feeds from FCPS schools and departments.
                Each feed has its own dedicated page with direct links.
            </p>
        </header>
        
        <main>
            ${Object.entries(feedsByCategory).map(([category, feeds]) => `
                <section class="feed-category">
                    <h2>${categoryDisplayNames[category] || category}</h2>
                    <div class="feed-grid">
                        ${feeds.map(feed => `
                            <div class="feed-card">
                                <h3><a href="${feed.feedInfo.slug}/">${feed.feedInfo.title}</a></h3>
                                <p class="feed-description">${feed.feedInfo.description || 'FCPS school news and updates'}</p>
                                <div class="feed-meta">
                                    <span class="article-count">${feed.items.length} articles</span>
                                    ${feed.success ? 
                                        `<span class="status success">✅ Active</span>` : 
                                        `<span class="status error">❌ Error</span>`
                                    }
                                </div>
                                <div class="feed-actions">
                                    <a href="${feed.feedInfo.slug}/" class="btn-primary">View Feed</a>
                                    ${feed.feedConfig.url ? `<a href="${feed.feedConfig.url}" target="_blank" class="btn-secondary">RSS</a>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>
            `).join('')}
        </main>
    </div>
    
    <style>
        .feed-category {
            margin-bottom: 3rem;
        }
        
        .feed-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-top: 1rem;
        }
        
        .feed-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 1.5rem;
            background: white;
        }
        
        .feed-card h3 {
            margin: 0 0 0.5rem 0;
        }
        
        .feed-card h3 a {
            text-decoration: none;
            color: #1e40af;
        }
        
        .feed-description {
            color: #666;
            font-size: 0.9rem;
            margin: 0.5rem 0;
        }
        
        .feed-meta {
            display: flex;
            gap: 0.5rem;
            margin: 1rem 0;
            font-size: 0.85rem;
        }
        
        .status.success { color: #059669; }
        .status.error { color: #dc2626; }
        
        .feed-actions {
            display: flex;
            gap: 0.5rem;
        }
        
        .btn-primary, .btn-secondary {
            padding: 0.5rem 1rem;
            border-radius: 4px;
            text-decoration: none;
            font-size: 0.85rem;
            border: 1px solid;
        }
        
        .btn-primary {
            background: #1e40af;
            color: white;
            border-color: #1e40af;
        }
        
        .btn-secondary {
            background: white;
            color: #374151;
            border-color: #d1d5db;
        }
    </style>
</body>
</html>`;
};

const formatDate = (dateString) => {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const buildIndividualFeeds = async () => {
  try {
    console.log('🏗️  Building Individual Feed Pages...\n');
    
    const { distDir, feedsDir } = ensureDirectories();
    
    // Copy CSS
    const cssSource = path.join(__dirname, '..', 'css', 'styles.css');
    const cssTarget = path.join(distDir, 'css', 'styles.css');
    fs.copyFileSync(cssSource, cssTarget);
    
    console.log(`📥 Fetching ${FEEDS_CONFIG.length} RSS feeds...\n`);
    
    // Fetch all feeds with delays to be respectful
    const feedResults = [];
    for (let i = 0; i < FEEDS_CONFIG.length; i++) {
      const feedConfig = FEEDS_CONFIG[i];
      const result = await fetchRSSFeed(feedConfig);
      feedResults.push(result);
      
      // Progress indicator
      if ((i + 1) % 10 === 0 || i === FEEDS_CONFIG.length - 1) {
        console.log(`Progress: ${i + 1}/${FEEDS_CONFIG.length} feeds processed`);
      }
      
      // Respectful delay between requests
      if (i < FEEDS_CONFIG.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log('\n📄 Generating individual feed pages...');
    
    // Create individual feed directories and pages
    const successfulFeeds = [];
    
    for (const feedResult of feedResults) {
      const slug = feedResult.feedInfo.slug;
      const feedDir = path.join(feedsDir, slug);
      
      // Create feed directory
      if (!fs.existsSync(feedDir)) {
        fs.mkdirSync(feedDir, { recursive: true });
      }
      
      // Generate HTML page
      const html = generateIndividualFeedHTML(feedResult);
      fs.writeFileSync(path.join(feedDir, 'index.html'), html);
      
      // Save JSON data for potential API use
      const jsonData = {
        feedInfo: feedResult.feedInfo,
        items: feedResult.items,
        lastUpdated: new Date().toISOString(),
        success: feedResult.success,
        error: feedResult.error || null
      };
      fs.writeFileSync(path.join(feedDir, 'data.json'), JSON.stringify(jsonData, null, 2));
      
      if (feedResult.success) {
        successfulFeeds.push(feedResult);
      }
      
      console.log(`✅ Created: /feeds/${slug}/`);
    }
    
    // Generate feed directory page
    const directoryHTML = generateFeedDirectoryHTML(feedResults);
    fs.writeFileSync(path.join(feedsDir, 'index.html'), directoryHTML);
    
    // Generate feed manifest for easy programmatic access
    const manifest = {
      totalFeeds: FEEDS_CONFIG.length,
      successfulFeeds: successfulFeeds.length,
      failedFeeds: FEEDS_CONFIG.length - successfulFeeds.length,
      lastUpdated: new Date().toISOString(),
      feeds: feedResults.map(result => ({
        name: result.feedInfo.title,
        slug: result.feedInfo.slug,
        category: result.feedInfo.category,
        url: `/feeds/${result.feedInfo.slug}/`,
        rssUrl: result.feedConfig.url,
        articleCount: result.items.length,
        success: result.success,
        error: result.error || null
      }))
    };
    
    fs.writeFileSync(path.join(feedsDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    
    console.log('\n🎉 Individual Feed Build Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Build Results:`);
    console.log(`   • Total feeds: ${manifest.totalFeeds}`);
    console.log(`   • Successful: ${manifest.successfulFeeds}`);
    console.log(`   • Failed: ${manifest.failedFeeds}`);
    console.log(`   • Individual pages created: ${feedResults.length}`);
    console.log(`   • Feed directory: /feeds/`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 URL Examples:');
    console.log('   • Feed Directory: /feeds/');
    console.log('   • Individual Feed: /feeds/aldrin-elementary/');
    console.log('   • JSON API: /feeds/aldrin-elementary/data.json');
    console.log('   • Feed Manifest: /feeds/manifest.json');
    
    return manifest;
    
  } catch (error) {
    console.error('❌ Individual feed build failed:', error);
    process.exit(1);
  }
};

// Export for use in other scripts
module.exports = { buildIndividualFeeds, createSlug };

// Run if called directly
if (require.main === module) {
  buildIndividualFeeds();
}
