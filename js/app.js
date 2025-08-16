class RSSFeedApp {
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
            
            const response = await fetch(`data/page-${pageNum}.json`);
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
            const response = await fetch(`data/page-${this.currentPage}.json`);
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
        
        const html = items.map(item => `
            <article class="rss-item">
                <header class="rss-item-header">
                    <h2 class="rss-item-title">
                        <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
                    </h2>
                    <div class="rss-item-meta">
                        <time class="rss-item-date">${this.formatDate(item.pubDate)}</time>
                        <span class="rss-item-source">${item.feedName}</span>
                        <span class="rss-item-category">${item.category}</span>
                    </div>
                </header>
                <div class="rss-item-content">
                    ${item.description}
                </div>
            </article>
        `).join('');
        
        container.innerHTML = html;
    }
    
    updatePagination(pageData) {
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const pageInfo = document.getElementById('page-info');
        
        pageInfo.textContent = `Page ${pageData.page} of ${pageData.totalPages}`;
        
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
});