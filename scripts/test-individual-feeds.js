const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const sanitizeHtml = require('sanitize-html');

// Test with just 3 feeds for quick demo
const TEST_FEEDS = [
  {
    name: 'Aldrin Elementary School',
    url: 'https://public.govdelivery.com/topics/Aldrin_ES_News/feed.rss',
    category: 'elementary'
  },
  {
    name: 'Annandale High School',
    url: 'https://public.govdelivery.com/topics/Annandale_HS_News/feed.rss',
    category: 'high'
  },
  {
    name: 'FCPS District News',
    url: 'https://public.govdelivery.com/topics/FCPS_ALL_News/feed.rss',
    category: 'district'
  }
];

const ITEMS_PER_FEED_PAGE = 15;
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
  
  [distDir, feedsDir, cssDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  return { distDir, feedsDir, cssDir };
};

const fetchRSSFeed = async (feedConfig) => {
  try {
    console.log(`Fetching: ${feedConfig.name}...`);
    
    const response = await fetch(feedConfig.url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FCPS RSS Test)'
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
        description: 'Feed temporarily unavailable',
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
    'academy': 'Academy'
  }[feedInfo.category] || feedInfo.category;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${feedInfo.title} - FCPS Individual Feed</title>
    <link rel="stylesheet" href="../../css/styles.css">
    <meta name="description" content="${feedInfo.description}">
</head>
<body>
    <div class="rss-feed-container">
        <header class="rss-feed-header">
            <nav class="breadcrumb" style="margin-bottom: 1rem; font-size: 0.9rem;">
                <a href="../../" style="color: #1e40af; text-decoration: none;">← All FCPS News</a> • 
                <a href="../" style="color: #1e40af; text-decoration: none;">All Feeds</a> • 
                <span style="color: #666;">${categoryDisplay}</span>
            </nav>
            <h1 style="color: #1f2937; margin-bottom: 0.5rem;">${feedInfo.title}</h1>
            <p class="rss-feed-description" style="color: #4b5563; margin-bottom: 1rem;">
                ${feedInfo.description}
                <br>
                <strong style="color: #059669;">${items.length} recent articles</strong> • 
                <span style="background: #e5e7eb; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">${categoryDisplay}</span>
            </p>
            ${feedInfo.link ? `<p style="margin-bottom: 1.5rem;"><a href="${feedInfo.link}" target="_blank" rel="noopener" style="color: #1e40af; text-decoration: none;">Visit Official Site →</a></p>` : ''}
        </header>
        
        <main>
            <div class="feed-url-info" style="background: #f3f4f6; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; border-left: 4px solid #1e40af;">
                <h3 style="margin: 0 0 0.5rem 0; color: #1f2937;">📱 Unique Feed URL</h3>
                <p style="margin: 0; font-family: monospace; background: white; padding: 0.5rem; border-radius: 4px; word-break: break-all;">
                    <strong>https://yourdomain.github.io/feeds/${feedInfo.slug}/</strong>
                </p>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #6b7280;">
                    ✨ This URL shows only articles from <strong>${feedInfo.title}</strong> and loads instantly (no RSS fetching needed)
                </p>
            </div>
        
            <div class="rss-items">
                ${items.length > 0 ? items.map(item => `
                    <article class="rss-item" style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; background: white;">
                        <header class="rss-item-header">
                            <h2 class="rss-item-title" style="margin: 0 0 0.5rem 0;">
                                <a href="${item.link}" target="_blank" rel="noopener noreferrer" style="color: #1e40af; text-decoration: none; font-size: 1.1rem; font-weight: 600;">${item.title}</a>
                            </h2>
                            <div class="rss-item-meta" style="color: #6b7280; font-size: 0.85rem; margin-bottom: 1rem;">
                                <time class="rss-item-date">${formatDate(item.pubDate)}</time>
                            </div>
                        </header>
                        <div class="rss-item-content" style="color: #374151; line-height: 1.6;">
                            ${item.description}
                        </div>
                    </article>
                `) : '<p class="no-results" style="text-align: center; color: #6b7280; font-style: italic; padding: 2rem;">No articles available at this time.</p>'}
            </div>
        </main>
        
        <footer style="text-align: center; margin-top: 2rem; padding: 1rem; border-top: 1px solid #e5e7eb;">
            <p><a href="../../" style="color: #1e40af; text-decoration: none;">← Back to All FCPS News</a></p>
        </footer>
    </div>
</body>
</html>`;
};

const generateFeedDirectoryHTML = (allFeeds) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FCPS Individual Feeds Directory - Test</title>
    <link rel="stylesheet" href="../css/styles.css">
    <meta name="description" content="Browse individual FCPS RSS feeds - each with unique URLs">
</head>
<body>
    <div class="rss-feed-container">
        <header class="rss-feed-header">
            <nav class="breadcrumb" style="margin-bottom: 1rem;">
                <a href="../" style="color: #1e40af; text-decoration: none;">← All FCPS News</a>
            </nav>
            <h1>🧪 Individual FCPS Feeds (Test)</h1>
            <p class="rss-feed-description">
                <strong>Testing ${allFeeds.length} individual RSS feeds</strong> - each with unique URLs for app integration.
                <br>Each feed loads instantly without fetching RSS in real-time.
            </p>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
                <h3 style="margin: 0 0 0.5rem 0; color: #92400e;">📱 App Integration URLs</h3>
                <p style="margin: 0; font-size: 0.9rem; color: #92400e;">
                    Each feed below has a unique URL that your app can use directly. No RSS fetching required!
                </p>
            </div>
        </header>
        
        <main>
            <div class="feed-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem;">
                ${allFeeds.map(feed => `
                    <div class="feed-card" style="border: 1px solid #d1d5db; border-radius: 8px; padding: 1.5rem; background: white;">
                        <h3 style="margin: 0 0 0.5rem 0;">
                            <a href="${feed.feedInfo.slug}/" style="text-decoration: none; color: #1e40af; font-size: 1.1rem;">${feed.feedInfo.title}</a>
                        </h3>
                        
                        <p style="color: #6b7280; font-size: 0.9rem; margin: 0.5rem 0;">
                            ${feed.feedInfo.description || 'FCPS news and updates'}
                        </p>
                        
                        <div class="feed-url" style="background: #f9fafb; padding: 0.75rem; border-radius: 4px; margin: 1rem 0; font-family: monospace; font-size: 0.8rem; word-break: break-all; border-left: 3px solid #1e40af;">
                            /feeds/${feed.feedInfo.slug}/
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center; margin: 1rem 0; font-size: 0.85rem;">
                            <span style="color: #374151;">${feed.items.length} articles</span>
                            ${feed.success ? 
                                `<span style="color: #059669;">✅ Active</span>` : 
                                `<span style="color: #dc2626;">❌ Error</span>`
                            }
                        </div>
                        
                        <div style="display: flex; gap: 0.5rem;">
                            <a href="${feed.feedInfo.slug}/" style="background: #1e40af; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-size: 0.85rem;">View Feed</a>
                            ${feed.feedConfig.url ? `<a href="${feed.feedConfig.url}" target="_blank" style="background: white; color: #374151; border: 1px solid #d1d5db; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-size: 0.85rem;">RSS</a>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </main>
    </div>
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

const buildTestIndividualFeeds = async () => {
  try {
    console.log('🧪 Building Individual Feed Test (3 feeds)...\n');
    
    const { distDir, feedsDir } = ensureDirectories();
    
    // Copy CSS
    const cssSource = path.join(__dirname, '..', 'css', 'styles.css');
    const cssTarget = path.join(distDir, 'css', 'styles.css');
    fs.copyFileSync(cssSource, cssTarget);
    
    console.log('📥 Fetching test RSS feeds...\n');
    
    // Fetch feeds
    const feedResults = [];
    for (let i = 0; i < TEST_FEEDS.length; i++) {
      const feedConfig = TEST_FEEDS[i];
      const result = await fetchRSSFeed(feedConfig);
      feedResults.push(result);
      
      // Small delay between requests
      if (i < TEST_FEEDS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n📄 Generating individual feed pages...');
    
    // Create individual feed directories and pages
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
      
      // Save JSON data
      const jsonData = {
        feedInfo: feedResult.feedInfo,
        items: feedResult.items,
        lastUpdated: new Date().toISOString(),
        success: feedResult.success,
        error: feedResult.error || null
      };
      fs.writeFileSync(path.join(feedDir, 'data.json'), JSON.stringify(jsonData, null, 2));
      
      console.log(`✅ Created: /feeds/${slug}/`);
    }
    
    // Generate feed directory page
    const directoryHTML = generateFeedDirectoryHTML(feedResults);
    fs.writeFileSync(path.join(feedsDir, 'index.html'), directoryHTML);
    
    console.log('\n🎉 Individual Feed Test Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Test Results:`);
    console.log(`   • Test feeds: ${TEST_FEEDS.length}`);
    console.log(`   • Individual pages: ${feedResults.length}`);
    console.log(`   • Feed directory: /feeds/`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 Test URLs:');
    feedResults.forEach(feed => {
      console.log(`   • ${feed.feedInfo.title}: /feeds/${feed.feedInfo.slug}/`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Run "npm run serve" to test at http://localhost:3000');
    
  } catch (error) {
    console.error('❌ Individual feed test failed:', error);
    process.exit(1);
  }
};

buildTestIndividualFeeds();
