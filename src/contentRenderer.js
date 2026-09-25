/**
 * Content Renderer Module
 * Dynamically binds and renders data from src/content.json into the DOM.
 */
import { initProjectShowcase } from './projectShowcase.js';

export function renderPortfolioContent(content) {
  if (!content) return;

  // 1. Meta / Site Title
  if (content.meta?.siteTitle) {
    document.title = content.meta.siteTitle;
  }

  // 2. Preloader
  if (content.meta?.preloader) {
    const preloaderTitle = document.querySelector('.preloader-title');
    const preloaderSub = document.querySelector('.preloader-sub');
    if (preloaderTitle && content.meta.preloader.title) {
      preloaderTitle.textContent = content.meta.preloader.title;
    }
    if (preloaderSub && content.meta.preloader.subtitle) {
      preloaderSub.textContent = content.meta.preloader.subtitle;
    }
  }

  // 3. Top Bar Brand Group
  if (content.personal) {
    const brandName = document.querySelector('.brand-name');
    const brandTag = document.querySelector('.brand-tag');
    const brandRole = document.querySelector('.brand-role');

    if (brandName && content.personal.name) brandName.textContent = content.personal.name;
    if (brandTag && content.personal.tag) brandTag.textContent = content.personal.tag;
    if (brandRole && content.personal.role) brandRole.textContent = content.personal.role;
  }

  // 4. Waypoint Dock & Hint
  if (content.navigation) {
    const hintDesktop = document.querySelector('.interaction-hint .hint-desktop') || document.querySelector('.interaction-hint span');
    if (hintDesktop && content.navigation.hint) {
      hintDesktop.textContent = content.navigation.hint;
    }

    const shortWaypointNames = {
      'CABIN DESK': 'CABIN',
      'SIGNAL TOWER': 'TOWER'
    };

    if (Array.isArray(content.navigation.waypoints)) {
      const dockNav = document.querySelector('.bottom-dock');
      if (dockNav) {
        // Clear and rebuild dock buttons cleanly
        dockNav.innerHTML = '';
        content.navigation.waypoints.forEach((wp, idx) => {
          const btn = document.createElement('button');
          btn.className = `dock-btn ${idx === 0 ? 'active' : ''}`;
          btn.setAttribute('data-waypoint', String(wp.id ?? idx));
          const name = wp.name || '';
          const shortName = wp.shortName || shortWaypointNames[name] || name;
          btn.innerHTML = `
            <span class="btn-index">${wp.code || `0${idx + 1}`}</span>
            <span class="btn-title">
              <span class="title-full">${name}</span>
              <span class="title-short">${shortName}</span>
            </span>
          `;
          dockNav.appendChild(btn);
        });
      }
    }
  }

  // 5. Cabin Workstation Modal (Terminal)
  if (content.workstation) {
    const termTitle = document.querySelector('.terminal-title');
    if (termTitle && content.workstation.title) {
      termTitle.textContent = content.workstation.title;
    }

    const shortTabLabels = {
      '01_PROJECTS': 'PROJECTS',
      '02_TECH_MATRIX': 'SKILLS',
      '03_INTERACTIVE_CLI': 'CLI'
    };

    // Tabs
    if (Array.isArray(content.workstation.tabs)) {
      const tabsNav = document.querySelector('.crt-tabs');
      if (tabsNav) {
        tabsNav.innerHTML = '';
        content.workstation.tabs.forEach((tab, idx) => {
          const btn = document.createElement('button');
          btn.className = `tab-btn ${idx === 0 ? 'active' : ''}`;
          btn.setAttribute('data-tab', tab.id);
          const short = shortTabLabels[tab.label] || tab.label.replace(/^\d+_/, '');
          btn.innerHTML = `
            <span class="tab-label-full">${tab.label}</span>
            <span class="tab-label-short">${short}</span>
          `;
          tabsNav.appendChild(btn);
        });
      }
    }

    // Enhanced 3D Project Showcase & Tactical Grid
    if (Array.isArray(content.workstation.projects)) {
      initProjectShowcase(content.workstation.projects);
    }

    // Tech Matrix / Skills Wrapper
    const skillsContainer = document.querySelector('#tab-skills .skills-wrapper');
    if (skillsContainer && Array.isArray(content.workstation.skills)) {
      skillsContainer.innerHTML = '';
      content.workstation.skills.forEach((cat) => {
        const catDiv = document.createElement('div');
        catDiv.className = 'skill-category';

        const chipsHtml = Array.isArray(cat.items)
          ? cat.items.map(item => {
              const extraClass = item.type ? ` ${item.type}` : '';
              return `<span class="skill-chip${extraClass}">${item.name}</span>`;
            }).join('')
          : '';

        catDiv.innerHTML = `
          <h4 class="category-title">${cat.category}</h4>
          <div class="skill-chips">${chipsHtml}</div>
        `;

        skillsContainer.appendChild(catDiv);
      });
    }

    // CLI Terminal Welcome Banner & Hint
    if (content.workstation.cli) {
      const cliHistory = document.getElementById('cli-history');
      if (cliHistory) {
        const bannerEl = cliHistory.querySelector('.cli-line.banner');
        const dimEl = cliHistory.querySelector('.cli-line.dim');
        if (bannerEl && content.workstation.cli.banner) {
          bannerEl.textContent = content.workstation.cli.banner;
        }
        if (dimEl && content.workstation.cli.hint) {
          dimEl.innerHTML = content.workstation.cli.hint;
        }
      }
      const cliPrompt = document.querySelector('.cli-prompt');
      if (cliPrompt && content.workstation.cli.prompt) {
        cliPrompt.textContent = content.workstation.cli.prompt;
      }
    }
  }

  // 6. Campfire Field Journal Modal
  if (content.journal) {
    const jBadge = document.querySelector('.journal-badge');
    const jTitle = document.querySelector('.journal-title');
    const jMeta = document.querySelector('.journal-meta');
    const jQuote = document.querySelector('.journal-quote');

    if (jBadge && content.journal.badge) jBadge.textContent = content.journal.badge;
    if (jTitle && content.journal.title) jTitle.textContent = content.journal.title;
    if (jMeta && content.journal.meta) jMeta.innerHTML = content.journal.meta;
    if (jQuote && content.journal.quote) jQuote.innerHTML = content.journal.quote;

    const entriesContainer = document.getElementById('journal-entries-container');
    if (entriesContainer && Array.isArray(content.journal.entries)) {
      entriesContainer.innerHTML = '';
      content.journal.entries.forEach(entry => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'journal-entry';
        entryDiv.innerHTML = `
          <h3>${entry.title}</h3>
          <p>${entry.content}</p>
        `;
        entriesContainer.appendChild(entryDiv);
      });
    }
  }

  // 7. Signal Tower Comms Console (Contact Modal)
  if (content.contact) {
    const cTitle = document.querySelector('.comms-title');
    const cSub = document.querySelector('.comms-sub');

    if (cTitle && content.contact.title) cTitle.textContent = content.contact.title;
    if (cSub && content.contact.subtitle) cSub.textContent = content.contact.subtitle;

    const channelsContainer = document.querySelector('.channels-grid');
    if (channelsContainer && Array.isArray(content.contact.channels)) {
      channelsContainer.innerHTML = '';
      content.contact.channels.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'channel-card';

        let actionBtns = '';
        if (ch.actionType === 'copy_and_send') {
          actionBtns = `
            <button class="copy-btn" data-copy="${ch.value}">Copy</button>
            <a href="${ch.url}" class="dispatch-link">${ch.actionLabel || 'Send ↗'}</a>
          `;
        } else {
          actionBtns = `
            <a href="${ch.url}" target="_blank" rel="noopener noreferrer" class="dispatch-link">${ch.actionLabel || 'Visit ↗'}</a>
          `;
        }

        card.innerHTML = `
          <div class="channel-icon">${ch.icon}</div>
          <div class="channel-info">
            <span class="channel-label">${ch.label}</span>
            <span class="channel-value">${ch.value}</span>
          </div>
          <div class="channel-actions">${actionBtns}</div>
        `;

        channelsContainer.appendChild(card);
      });
    }
  }

  // 8. Audio labels
  if (content.audio) {
    const mixerHeader = document.querySelector('.mixer-header');
    if (mixerHeader && content.audio.mixerTitle) {
      mixerHeader.textContent = content.audio.mixerTitle;
    }
  }
}
