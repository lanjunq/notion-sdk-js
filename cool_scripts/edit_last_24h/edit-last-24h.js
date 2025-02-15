// Dependencies
const { Client } = require('@notionhq/client');
const fs = require('fs');

// Authentications
require("dotenv").config()
const notion = new Client({ auth: process.env.NOTION_KEY });

// Workspace configuration
const newPageParentId = process.env.NEW_PAGE_PARENT_ID; // Create new pages under this page

// Script Run Configurations
const backtrackingDays = 3; // How many days to backtrack
const FETCH_RESULT_FILE = 'notion-search-response.json'; // File to save the notion search response, for debugging

// main!
// Script that uses the Notion search API to: 
// 1. Find all pages that have been edited in the last 24 hours
// 2. Create a new page that mentions all of those pages
findPagesEditedInLastXDays(backtrackingDays);

async function findPagesEditedInLastXDays(days) {
    const response = await fetchNotionData();
    fs.writeFileSync(FETCH_RESULT_FILE, JSON.stringify(response, null, 2));
    console.log('💾 Fetched data saved to', FETCH_RESULT_FILE);

    // Check each day in the previous X days
    const targetDate = new Date();
    for (let i = days; i >= 0; i--) {
        targetDate.setDate(new Date().getDate() - i);

        const title = titleForDate(targetDate);

        if (await pageExists(response.results, title)) {
            console.log(`[${title}] Page already exists, skipping ⏩`);
            continue;
        }

        var pageEdited = await findPagesEditedOnDate(response.results, targetDate);
        pageEdited.reverse();

        if (pageEdited.length === 0) {
            console.log(`[${title}] No pages edited on ${titleForDate(targetDate)}, skipping ⏩`);
            continue;
        }

        pageEdited = pageEdited.filter(page => page.id.replace(/-/g, '') !== newPageParentId);

        console.log(`[${title}] Creating page... ✅. ${pageEdited.length} pages mentioned.`);
        await createNewPageMentioningPages(newPageParentId, title, pageEdited);
    }
};

// functions defined below
async function fetchNotionData() {
    console.log('🛜 Fetching notion data...');
    const response = await notion.search({
        sort: {
            direction: 'descending',
            timestamp: 'last_edited_time'
        },
        filter: {
            property: 'object',
            value: 'page'
        }
    });
    console.log('✅ Data fetched', response.results.length, 'pages');
    return response;
}

function titleForDate(date) {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

async function pageExists(pages, searchPageTitle) {
    // Title: "Feburary 15, 2025"
    // becomes 
    // https://www.notion.so/February-14-2025-<random>
    const escapedTitle = searchPageTitle.replace(/[ ,]+/g, '-');
    const prefix = 'https://www.notion.so/';
    return pages.some(page => page.url.includes(prefix + escapedTitle));
}

// 在获取页面列表时使用这个函数
async function findPagesEditedOnDate(pages, date) {

    function isSameDay(lhs, rhs) {
        return lhs.getFullYear() === rhs.getFullYear() &&
            lhs.getMonth() === rhs.getMonth() &&
            lhs.getDate() === rhs.getDate();
    }

    return pages.filter(page => isSameDay(new Date(page.last_edited_time), date));
}

async function createNewPageMentioningPages(parentPageId, title, pages) {
    console.log('Creating new page :', title);

    console.log(pages);

    // Create a new page that mentions all of those pages
    const newPage = await notion.pages.create({
        parent: {
            page_id: parentPageId
        },
        properties: {
            title: {
                title: [{ text: { content: title }}]
            }
        },
        children: 
            pages.map(page => (
                {
                    type: 'link_to_page',
                    link_to_page: {
                        type: 'page_id',
                        page_id: page.id
                    }
                }
            ))
    });
}