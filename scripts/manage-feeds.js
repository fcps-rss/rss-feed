const fs = require('fs');
const path = require('path');

// Helper script to manage RSS feeds
class FeedManager {
    constructor() {
        this.feedsPath = path.join(__dirname, '..', 'config', 'feeds.json');
        this.feeds = this.loadFeeds();
    }
    
    loadFeeds() {
        try {
            return JSON.parse(fs.readFileSync(this.feedsPath, 'utf8'));
        } catch (error) {
            console.log('Creating new feeds.json file...');
            return [];
        }
    }
    
    saveFeeds() {
        fs.writeFileSync(this.feedsPath, JSON.stringify(this.feeds, null, 2));
        console.log(`✅ Saved ${this.feeds.length} feeds to ${this.feedsPath}`);
    }
    
    addFeed(name, url, category = 'general') {
        // Check if feed already exists
        const exists = this.feeds.find(feed => feed.url === url);
        if (exists) {
            console.log(`⚠️  Feed already exists: ${name}`);
            return false;
        }
        
        this.feeds.push({ name, url, category });
        console.log(`✅ Added feed: ${name} (${category})`);
        return true;
    }
    
    removeFeed(url) {
        const index = this.feeds.findIndex(feed => feed.url === url);
        if (index === -1) {
            console.log(`❌ Feed not found: ${url}`);
            return false;
        }
        
        const removed = this.feeds.splice(index, 1)[0];
        console.log(`🗑️  Removed feed: ${removed.name}`);
        return true;
    }
    
    listFeeds() {
        console.log(`\n📋 Current feeds (${this.feeds.length}):`);
        this.feeds.forEach((feed, index) => {
            console.log(`  ${index + 1}. ${feed.name} (${feed.category})`);
            console.log(`     ${feed.url}`);
        });
    }
    
    bulkAddFromCSV(csvContent) {
        // Expected CSV format: name,url,category
        const lines = csvContent.trim().split('\n');
        const header = lines[0].toLowerCase();
        
        if (!header.includes('name') || !header.includes('url')) {
            throw new Error('CSV must have "name" and "url" columns');
        }
        
        let added = 0;
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length >= 2) {
                const name = parts[0].trim().replace(/"/g, '');
                const url = parts[1].trim().replace(/"/g, '');
                const category = parts[2] ? parts[2].trim().replace(/"/g, '') : 'general';
                
                if (this.addFeed(name, url, category)) {
                    added++;
                }
            }
        }
        
        console.log(`\n📊 Bulk import completed: ${added} feeds added`);
        return added;
    }
    
    validateFeeds() {
        console.log('\n🔍 Validating feed URLs...');
        const invalid = [];
        
        this.feeds.forEach(feed => {
            try {
                new URL(feed.url);
                if (!feed.url.startsWith('http')) {
                    invalid.push(`${feed.name}: URL must start with http(s)`);
                }
            } catch (error) {
                invalid.push(`${feed.name}: Invalid URL format`);
            }
        });
        
        if (invalid.length === 0) {
            console.log('✅ All feed URLs are valid');
        } else {
            console.log('❌ Invalid feeds found:');
            invalid.forEach(msg => console.log(`   ${msg}`));
        }
        
        return invalid;
    }
    
    getStats() {
        const categories = {};
        this.feeds.forEach(feed => {
            categories[feed.category] = (categories[feed.category] || 0) + 1;
        });
        
        console.log('\n📊 Feed Statistics:');
        console.log(`   Total feeds: ${this.feeds.length}`);
        console.log('   By category:');
        Object.entries(categories).forEach(([cat, count]) => {
            console.log(`     ${cat}: ${count}`);
        });
    }
}

// Command line interface
if (require.main === module) {
    const manager = new FeedManager();
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
RSS Feed Manager

Usage:
  node scripts/manage-feeds.js list                    # List all feeds
  node scripts/manage-feeds.js add "Name" "URL" "cat"  # Add a feed
  node scripts/manage-feeds.js remove "URL"            # Remove a feed
  node scripts/manage-feeds.js validate                # Validate all URLs
  node scripts/manage-feeds.js stats                   # Show statistics
  node scripts/manage-feeds.js import feeds.csv        # Bulk import from CSV

CSV Format for bulk import:
  name,url,category
  "Example News","https://example.com/rss","news"
  "Tech Blog","https://techblog.com/feed","technology"
        `);
        process.exit(0);
    }
    
    const command = args[0];
    
    try {
        switch (command) {
            case 'list':
                manager.listFeeds();
                break;
                
            case 'add':
                if (args.length < 3) {
                    console.log('Usage: add "Name" "URL" ["category"]');
                    process.exit(1);
                }
                manager.addFeed(args[1], args[2], args[3] || 'general');
                manager.saveFeeds();
                break;
                
            case 'remove':
                if (args.length < 2) {
                    console.log('Usage: remove "URL"');
                    process.exit(1);
                }
                manager.removeFeed(args[1]);
                manager.saveFeeds();
                break;
                
            case 'validate':
                manager.validateFeeds();
                break;
                
            case 'stats':
                manager.getStats();
                break;
                
            case 'import':
                if (args.length < 2) {
                    console.log('Usage: import path/to/feeds.csv');
                    process.exit(1);
                }
                const csvPath = args[1];
                if (!fs.existsSync(csvPath)) {
                    console.log(`File not found: ${csvPath}`);
                    process.exit(1);
                }
                const csvContent = fs.readFileSync(csvPath, 'utf8');
                manager.bulkAddFromCSV(csvContent);
                manager.saveFeeds();
                break;
                
            default:
                console.log(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

module.exports = FeedManager;
