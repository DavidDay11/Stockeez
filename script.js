// ========================================
// STOCKHOGAR - GESTIÓN INTELIGENTE DE DESPENSA
// ========================================

// Firebase Configuration and Initialization
let firebaseApp = null;
let database = null;
let sessionRef = null;
let deviceId = localStorage.getItem('deviceId') || generateDeviceId();
let currentSessionCode = localStorage.getItem('sessionCode') || null;
let isConnected = false;
let isSyncing = false;

function generateDeviceId() {
    const id = 'device_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('deviceId', id);
    return id;
}

function initFirebase() {
    // Only initialize if config is properly set
    const firebaseIsConfigured = typeof firebaseConfig !== 'undefined' && 
                                  firebaseConfig.apiKey && 
                                  firebaseConfig.apiKey !== 'TU_API_KEY_AQUI';
    
    if (!firebaseIsConfigured) {
        console.log('📱 Modo local: Firebase no configurado');
        return;
    }

    try {
        if (!firebase.apps.length) {
            firebaseApp = firebase.initializeApp(firebaseConfig);
            database = firebase.database();
            
            // Auto-connect if session exists
            if (currentSessionCode) {
                connectToSession(currentSessionCode);
            }
        }
    } catch (error) {
        console.error('Error inicializando Firebase:', error);
        showToast('⚠️ Error de sincronización. Funciona en modo local.');
    }
}

function connectToSession(code = null) {
    const sessionCode = (code || document.getElementById('sessionCode').value).toUpperCase().trim();
    
    if (!sessionCode || sessionCode.length !== 6) {
        showToast('Ingresa un código de 6 caracteres');
        return;
    }

    if (!database) {
        showToast('⚠️ Configura Firebase primero. Lee INSTRUCCIONES-FIREBASE.md');
        return;
    }

    currentSessionCode = sessionCode;
    localStorage.setItem('sessionCode', sessionCode);
    
    sessionRef = database.ref(`sessions/${sessionCode}`);
    
    // Register device
    sessionRef.child('devices').child(deviceId).set({
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
        name: `Dispositivo ${deviceId.substr(-4)}`
    });

    // Remove device on disconnect
    sessionRef.child('devices').child(deviceId).onDisconnect().remove();

    // Upload current data
    isSyncing = true;
    sessionRef.child('data').set({
        items: items,
        categories: categories,
        lastUpdate: firebase.database.ServerValue.TIMESTAMP,
        updatedBy: deviceId
    }).then(() => {
        isSyncing = false;
        isConnected = true;
        updateSyncUI();
        showToast('✓ Sesión conectada');
        
        // Listen for changes
        sessionRef.child('data').on('value', (snapshot) => {
            if (!isSyncing) {
                const data = snapshot.val();
                if (data && data.updatedBy !== deviceId) {
                    items = data.items || [];
                    categories = data.categories || categories;
                    saveToStorage();
                    renderDashboard();
                    renderItems();
                    renderSettings();
                }
            }
        });

        // Listen for device count
        sessionRef.child('devices').on('value', (snapshot) => {
            const devices = snapshot.val();
            const count = devices ? Object.keys(devices).length : 1;
            document.getElementById('deviceCount').textContent = count;
        });
    });
}

function disconnectSession() {
    if (sessionRef) {
        sessionRef.child('devices').child(deviceId).remove();
        sessionRef.off();
        sessionRef = null;
    }
    
    currentSessionCode = null;
    isConnected = false;
    localStorage.removeItem('sessionCode');
    
    updateSyncUI();
    showToast('Sesión desconectada');
}

function syncToFirebase() {
    if (!isConnected || !sessionRef || isSyncing) return;
    
    isSyncing = true;
    sessionRef.child('data').set({
        items: items,
        categories: categories,
        lastUpdate: firebase.database.ServerValue.TIMESTAMP,
        updatedBy: deviceId
    }).then(() => {
        isSyncing = false;
    }).catch(() => {
        isSyncing = false;
    });
}

function updateSyncUI() {
    if (isConnected) {
        document.getElementById('notConnected').style.display = 'none';
        document.getElementById('connected').style.display = 'block';
        document.getElementById('activeSessionCode').textContent = currentSessionCode;
    } else {
        document.getElementById('notConnected').style.display = 'block';
        document.getElementById('connected').style.display = 'none';
    }
}

// Data Management
let items = JSON.parse(localStorage.getItem('stockItems')) || [];
let categories = JSON.parse(localStorage.getItem('categories')) || [
    'Carnes', 'Verduras', 'Despensa', 'Higiene', 'Limpieza', 'Lácteos', 'Bebidas'
];
let currentFilter = 'Todas';
let editingItemId = null;
let shoppingCart = {}; // { itemId: { checked: bool, quantity: number, price: number } }
let currentCurrency = localStorage.getItem('currency') || 'ARS';
let confirmCallback = null;
let recipes = JSON.parse(localStorage.getItem('recipes')) || [];
let currentRecipeFilter = 'all';

// Get Anthropic API key from config.js
let anthropicApiKey = '';
if (typeof anthropicConfig !== 'undefined' && anthropicConfig.apiKey && anthropicConfig.apiKey !== 'TU_ANTHROPIC_API_KEY_AQUI') {
    anthropicApiKey = anthropicConfig.apiKey;
}

// Currency symbols
const currencySymbols = {
    'ARS': 'AR$',
    'USD': 'USD',
    'EUR': 'EUR',
    'BRL': 'R$',
    'CLP': 'CLP',
    'MXN': 'MXN',
    'COP': 'COP',
    'UYU': 'UYU'
};

function getCurrencySymbol() {
    return currencySymbols[currentCurrency] || currentCurrency;
}

function changeCurrency(currency) {
    currentCurrency = currency;
    localStorage.setItem('currency', currency);
    
    // Refresh all views to update currency symbols
    renderDashboard();
    renderItems();
    renderShoppingList();
    
    showToast(`Moneda cambiada a ${currencySymbols[currency]}`);
}

function saveToStorage() {
    localStorage.setItem('stockItems', JSON.stringify(items));
    localStorage.setItem('categories', JSON.stringify(categories));
}

// Navigation
function switchPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(page + 'Page').classList.add('active');
    event.currentTarget.classList.add('active');
    
    if (page === 'dashboard') renderDashboard();
    if (page === 'items') renderItems();
    if (page === 'shopping') renderShoppingList();
    if (page === 'settings') renderSettings();
    if (page === 'recipes') renderRecipes();
}

// Dashboard
function renderDashboard() {
    const now = new Date();
    
    // Artículos vencidos (fecha pasada)
    const expiredItems = items.filter(item => {
        if (!item.expiryDate) return false;
        const expiryDate = new Date(item.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry < 0;
    });
    
    // Artículos por vencer (próximos 7 días)
    const expiringSoon = items.filter(item => {
        if (!item.expiryDate) return false;
        const expiryDate = new Date(item.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
    });
    
    const lowStockItems = items.filter(item => item.stock <= item.minStock);
    
    document.getElementById('totalItems').textContent = items.length;
    document.getElementById('vencidosItems').textContent = expiredItems.length;
    document.getElementById('expiredItems').textContent = expiringSoon.length;
    document.getElementById('lowStock').textContent = lowStockItems.length;
    
    const alertsContainer = document.getElementById('alertsContainer');
    
    // Mostrar vencidos primero, luego por vencer, luego stock bajo
    const allAlerts = [...expiredItems, ...expiringSoon, ...lowStockItems];
    
    if (allAlerts.length === 0) {
        alertsContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-icon">✨</div>
                <p>¡Todo en orden! No hay alertas.</p>
            </div>
        `;
    } else {
        let alertsHTML = '';
        
        // Sección de vencidos (si hay)
        if (expiredItems.length > 0) {
            alertsHTML += `
                <div style="grid-column: 1 / -1; margin-bottom: 8px;">
                    <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; color: var(--danger); display: flex; align-items: center; gap: 8px;">
                        <span>⚠️</span> Artículos Vencidos (${expiredItems.length})
                    </h3>
                </div>
            `;
            alertsHTML += expiredItems.slice(0, 3).map(item => renderItemCard(item)).join('');
        }
        
        // Sección de por vencer (si hay)
        if (expiringSoon.length > 0) {
            alertsHTML += `
                <div style="grid-column: 1 / -1; margin-bottom: 8px; margin-top: ${expiredItems.length > 0 ? '20px' : '0'};">
                    <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; color: var(--warning); display: flex; align-items: center; gap: 8px;">
                        <span>⚡</span> Por Vencer (${expiringSoon.length})
                    </h3>
                </div>
            `;
            alertsHTML += expiringSoon.slice(0, 3).map(item => renderItemCard(item)).join('');
        }
        
        alertsContainer.innerHTML = alertsHTML;
    }
}

// Items
function renderItems() {
    renderCategoryFilters();
    const container = document.getElementById('itemsContainer');
    
    let filteredItems = currentFilter === 'Todas' 
        ? items 
        : items.filter(item => item.category === currentFilter);
    
    if (filteredItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-icon">📦</div>
                <p>No hay artículos en esta categoría</p>
            </div>
        `;
    } else {
        container.innerHTML = filteredItems.map(item => renderItemCard(item)).join('');
    }
}

function renderCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    const allCategories = ['Todas', ...categories];
    
    container.innerHTML = allCategories.map(cat => `
        <div class="filter-chip ${currentFilter === cat ? 'active' : ''}" 
             onclick="filterByCategory('${cat}')">
            ${cat}
        </div>
    `).join('');
}

function filterByCategory(category) {
    currentFilter = category;
    renderItems();
}

function renderItemCard(item) {
    const expiryInfo = getExpiryInfo(item);
    const unit = item.unit || 'unidades';
    const stockStatus = item.stock <= item.minStock ? `⚠️ Stock Bajo: ${item.stock} ${unit}` : `${item.stock} ${unit}`;
    const currencySymbol = getCurrencySymbol();
    
    return `
        <div class="item-card">
            <div class="item-header">
                <div class="item-name">${item.name}</div>
                <div class="item-category">${item.category}</div>
            </div>
            
            <div class="item-info">
                <div class="info-block">
                    <div class="info-label">Stock</div>
                    <div class="info-value" style="color: ${item.stock <= item.minStock ? 'var(--warning)' : 'var(--text)'}">${stockStatus}</div>
                </div>
                <div class="info-block">
                    <div class="info-label">Precio</div>
                    <div class="info-value">${currencySymbol} ${item.price ? item.price.toFixed(2) : '-'}</div>
                </div>
            </div>
            
            ${expiryInfo.html}
            
            <div class="item-actions">
                <button class="btn-icon" onclick="editItem('${item.id}')">✏️ Editar</button>
                <button class="btn-icon" onclick="viewPriceHistory('${item.id}')">💰 Historial</button>
                <button class="btn-icon" onclick="deleteItem('${item.id}')">🗑️</button>
            </div>
        </div>
    `;
}

function getExpiryInfo(item) {
    if (!item.expiryDate) {
        return { html: '', class: '' };
    }
    
    const now = new Date();
    const expiryDate = new Date(item.expiryDate);
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    let className, message;
    
    if (daysUntilExpiry < 0) {
        className = 'expiry-critical';
        message = `⚠️ Venció hace ${Math.abs(daysUntilExpiry)} días`;
    } else if (daysUntilExpiry === 0) {
        className = 'expiry-critical';
        message = '⚠️ Vence HOY';
    } else if (daysUntilExpiry <= 3) {
        className = 'expiry-critical';
        message = `⚠️ Vence en ${daysUntilExpiry} día${daysUntilExpiry > 1 ? 's' : ''}`;
    } else if (daysUntilExpiry <= 7) {
        className = 'expiry-warning';
        message = `⚡ Vence en ${daysUntilExpiry} días`;
    } else if (daysUntilExpiry <= 14) {
        className = 'expiry-good';
        message = `✓ Vence en ${daysUntilExpiry} días`;
    } else {
        return { html: '', class: '' };
    }
    
    return {
        html: `<div class="expiry-alert ${className}">${message}</div>`,
        class: className
    };
}

// Modal Management
function openAddItemModal() {
    editingItemId = null;
    document.getElementById('modalTitle').textContent = 'Agregar Artículo';
    document.getElementById('itemForm').reset();
    populateCategorySelect();
    
    // Update price label with current currency
    const priceLabel = document.getElementById('priceLabelCurrency');
    if (priceLabel) {
        priceLabel.textContent = `Precio (${getCurrencySymbol()})`;
    }
    
    document.getElementById('itemModal').classList.add('active');
}

function editItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    editingItemId = id;
    document.getElementById('modalTitle').textContent = 'Editar Artículo';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemStock').value = item.stock;
    document.getElementById('itemUnit').value = item.unit || 'unidades';
    document.getElementById('itemMinStock').value = item.minStock;
    document.getElementById('itemExpiry').value = item.expiryDate || '';
    document.getElementById('itemPrice').value = item.price || '';
    
    populateCategorySelect();
    document.getElementById('itemCategory').value = item.category;
    
    // Update price label with current currency
    const priceLabel = document.getElementById('priceLabelCurrency');
    if (priceLabel) {
        priceLabel.textContent = `Precio (${getCurrencySymbol()})`;
    }
    
    document.getElementById('itemModal').classList.add('active');
}

function closeModal() {
    document.getElementById('itemModal').classList.remove('active');
}

function populateCategorySelect() {
    const select = document.getElementById('itemCategory');
    select.innerHTML = categories.map(cat => 
        `<option value="${cat}">${cat}</option>`
    ).join('');
}

function saveItem(event) {
    event.preventDefault();
    
    const name = document.getElementById('itemName').value.trim();
    const category = document.getElementById('itemCategory').value;
    const stock = parseFloat(document.getElementById('itemStock').value);
    const unit = document.getElementById('itemUnit').value;
    const minStock = parseFloat(document.getElementById('itemMinStock').value);
    const expiryDate = document.getElementById('itemExpiry').value;
    const price = parseFloat(document.getElementById('itemPrice').value) || 0;
    
    if (editingItemId) {
        // Edit existing
        const item = items.find(i => i.id === editingItemId);
        if (item) {
            item.name = name;
            item.category = category;
            item.stock = stock;
            item.unit = unit;
            item.minStock = minStock;
            item.expiryDate = expiryDate;
            
            // Add price to history if changed
            if (price && price !== item.price) {
                item.priceHistory = item.priceHistory || [];
                item.priceHistory.push({
                    price: price,
                    date: new Date().toISOString()
                });
                item.price = price;
            }
        }
    } else {
        // Check for duplicates (same name and expiry date)
        const duplicate = items.find(i => 
            i.name.toLowerCase() === name.toLowerCase() && 
            i.expiryDate === expiryDate &&
            expiryDate !== '' // Only check if there's an expiry date
        );
        
        if (duplicate) {
            // Use custom styled confirmation modal
            const currencySymbol = getCurrencySymbol();
            const expiryDateFormatted = new Date(duplicate.expiryDate).toLocaleDateString('es-AR');
            
            showConfirmModal(
                '🔄 Producto Duplicado',
                `
                <div style="background: var(--bg-input); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
                    <div style="font-weight: 600; font-size: 16px; margin-bottom: 12px; color: var(--text);">
                        ${duplicate.name}
                    </div>
                    <div style="display: grid; gap: 8px; font-size: 14px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-secondary);">Fecha de vencimiento:</span>
                            <span style="color: var(--text); font-weight: 600;">${expiryDateFormatted}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-secondary);">Stock actual:</span>
                            <span style="color: var(--primary); font-weight: 600;">${duplicate.stock} ${duplicate.unit}</span>
                        </div>
                    </div>
                </div>
                <p style="color: var(--text); font-size: 14px; margin-bottom: 12px;">
                    ¿Quieres <strong style="color: var(--primary);">SUMAR ${stock} ${unit}</strong> al stock existente?
                </p>
                <p style="color: var(--text-secondary); font-size: 13px;">
                    Stock resultante: <strong style="color: var(--primary);">${duplicate.stock + stock} ${unit}</strong>
                </p>
                `,
                (confirmed) => {
                    if (confirmed) {
                        duplicate.stock += stock;
                        
                        // Update price if provided
                        if (price && price !== duplicate.price) {
                            duplicate.priceHistory = duplicate.priceHistory || [];
                            duplicate.priceHistory.push({
                                price: price,
                                date: new Date().toISOString()
                            });
                            duplicate.price = price;
                        }
                        
                        saveToStorage();
                        syncToFirebase();
                        closeModal();
                        renderItems();
                        renderDashboard();
                        showToast(`✓ Stock actualizado: ${duplicate.stock} ${duplicate.unit}`);
                    } else {
                        closeModal();
                    }
                }
            );
            return;
        }
        
        // Add new
        const newItem = {
            id: Date.now().toString(),
            name,
            category,
            stock,
            unit,
            minStock,
            expiryDate,
            price,
            priceHistory: price ? [{ price, date: new Date().toISOString() }] : [],
            createdAt: new Date().toISOString()
        };
        items.push(newItem);
    }
    
    saveToStorage();
    syncToFirebase();
    closeModal();
    renderItems();
    renderDashboard();
    showToast(editingItemId ? 'Artículo actualizado' : 'Artículo agregado');
}

// Custom Confirmation Modal
function showConfirmModal(title, message, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').innerHTML = message;
    confirmCallback = callback;
    document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal(result) {
    document.getElementById('confirmModal').classList.remove('active');
    if (confirmCallback) {
        confirmCallback(result);
        confirmCallback = null;
    }
}

function deleteItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    showConfirmModal(
        '🗑️ Eliminar Artículo',
        `
        <div style="background: var(--bg-input); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
            <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px; color: var(--text);">
                ${item.name}
            </div>
            <div style="color: var(--text-secondary); font-size: 14px;">
                ${item.category} • ${item.stock} ${item.unit}
            </div>
        </div>
        <p style="color: var(--text); font-size: 14px;">
            ¿Estás seguro de eliminar este artículo?
        </p>
        `,
        (confirmed) => {
            if (confirmed) {
                items = items.filter(i => i.id !== id);
                saveToStorage();
                syncToFirebase();
                renderItems();
                renderDashboard();
                showToast('Artículo eliminado');
            }
        }
    );
}

// Price History
function viewPriceHistory(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    const content = document.getElementById('priceHistoryContent');
    const currencySymbol = getCurrencySymbol();
    
    if (!item.priceHistory || item.priceHistory.length === 0) {
        content.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Sin historial de precios</p>';
    } else {
        const history = [...item.priceHistory].reverse();
        content.innerHTML = `
            <div class="price-history">
                <h4 style="margin-bottom: 12px; font-family: 'Outfit', sans-serif;">${item.name}</h4>
                ${history.map(entry => `
                    <div class="price-entry">
                        <span>${new Date(entry.date).toLocaleDateString('es-AR')}</span>
                        <span style="font-weight: 600; color: var(--primary)">${currencySymbol} ${entry.price.toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    document.getElementById('priceModal').classList.add('active');
}

function closePriceModal() {
    document.getElementById('priceModal').classList.remove('active');
}

// Shopping List
function renderShoppingList() {
    const container = document.getElementById('shoppingListContainer');
    const shoppingItems = items.filter(item => item.stock <= item.minStock);
    const currencySymbol = getCurrencySymbol();
    
    if (shoppingItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✓</div>
                <p>No hay artículos para comprar</p>
            </div>
        `;
        return;
    }

    // Calculate total
    let total = 0;
    let itemsChecked = 0;
    shoppingItems.forEach(item => {
        if (shoppingCart[item.id]?.checked) {
            const price = shoppingCart[item.id].price || 0;
            total += price;
            itemsChecked++;
        }
    });

    container.innerHTML = `
        ${shoppingItems.map(item => {
            const cartItem = shoppingCart[item.id] || { checked: false, quantity: '', price: '' };
            return `
                <div class="shopping-list-item ${cartItem.checked ? 'checked' : ''}" id="shop-item-${item.id}">
                    <div class="shopping-item-header">
                        <div class="checkbox ${cartItem.checked ? 'checked' : ''}" 
                             onclick="toggleShoppingItem('${item.id}')"></div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 16px;">${item.name}</div>
                            <div style="color: var(--text-secondary); font-size: 13px; margin-top: 4px;">
                                ${item.category} • Falta: ${(item.minStock - item.stock).toFixed(1)} ${item.unit || 'unidades'} • 
                                ${item.price ? `Último: ${currencySymbol} ${item.price.toFixed(2)}` : 'Sin precio'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="shopping-item-inputs">
                        <div>
                            <div class="inline-label">Cantidad comprada</div>
                            <input type="number" 
                                   class="inline-input" 
                                   placeholder="0"
                                   step="0.1"
                                   min="0"
                                   value="${cartItem.quantity}"
                                   onchange="updateCartItem('${item.id}', 'quantity', this.value)">
                        </div>
                        <div>
                            <div class="inline-label">Precio pagado (${currencySymbol})</div>
                            <input type="number" 
                                   class="inline-input" 
                                   placeholder="0.00"
                                   step="0.01"
                                   min="0"
                                   value="${cartItem.price}"
                                   onchange="updateCartItem('${item.id}', 'price', this.value)">
                        </div>
                    </div>
                </div>
            `;
        }).join('')}
        
        ${itemsChecked > 0 ? `
            <div class="shopping-total-card">
                <div class="shopping-total-row" style="margin-bottom: 16px;">
                    <div class="shopping-total-label">Total de Compra</div>
                    <div class="shopping-total-value">${currencySymbol} ${total.toFixed(2)}</div>
                </div>
                <div style="color: rgba(255,255,255,0.8); font-size: 13px; margin-bottom: 16px;">
                    ${itemsChecked} artículo${itemsChecked !== 1 ? 's' : ''} seleccionado${itemsChecked !== 1 ? 's' : ''}
                </div>
                <button class="btn" onclick="finishShopping()" 
                        style="width: 100%; background: white; color: var(--primary-dark); font-weight: 600; box-shadow: none;">
                    ✓ Finalizar Compra y Actualizar Stock
                </button>
            </div>
        ` : ''}
    `;
}

function toggleShoppingItem(itemId) {
    if (!shoppingCart[itemId]) {
        shoppingCart[itemId] = { checked: false, quantity: '', price: '' };
    }
    shoppingCart[itemId].checked = !shoppingCart[itemId].checked;
    renderShoppingList();
}

function updateCartItem(itemId, field, value) {
    if (!shoppingCart[itemId]) {
        shoppingCart[itemId] = { checked: true, quantity: '', price: '' };
    }
    shoppingCart[itemId][field] = parseFloat(value) || 0;
    renderShoppingList();
}

function finishShopping() {
    const purchasedItems = [];
    
    Object.keys(shoppingCart).forEach(itemId => {
        const cartItem = shoppingCart[itemId];
        if (cartItem.checked) {
            const item = items.find(i => i.id === itemId);
            if (item) {
                // Update stock
                if (cartItem.quantity > 0) {
                    item.stock += cartItem.quantity;
                }
                
                // Update price and history
                if (cartItem.price > 0 && cartItem.price !== item.price) {
                    item.priceHistory = item.priceHistory || [];
                    item.priceHistory.push({
                        price: cartItem.price,
                        date: new Date().toISOString()
                    });
                    item.price = cartItem.price;
                }
                
                purchasedItems.push(item.name);
            }
        }
    });

    if (purchasedItems.length === 0) {
        showToast('No hay artículos para actualizar');
        return;
    }

    // Clear shopping cart
    shoppingCart = {};
    
    // Save and sync
    saveToStorage();
    syncToFirebase();
    
    // Refresh views
    renderShoppingList();
    renderDashboard();
    renderItems();
    
    showToast(`✓ Compra finalizada: ${purchasedItems.length} artículo${purchasedItems.length !== 1 ? 's' : ''} actualizado${purchasedItems.length !== 1 ? 's' : ''}`);
}

// Export Functions
function exportToPDF() {
    const shoppingItems = items.filter(item => item.stock <= item.minStock);
    
    if (shoppingItems.length === 0) {
        showToast('No hay artículos para exportar');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const currencySymbol = getCurrencySymbol();
    
    doc.setFontSize(20);
    doc.text('Lista de Compras - StockEz', 20, 20);
    
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, 20, 30);
    doc.text(`Total de articulos: ${shoppingItems.length}`, 20, 36);
    
    let y = 50;
    doc.setFontSize(12);
    
    shoppingItems.forEach((item, index) => {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
        
        const needed = item.minStock - item.stock;
        
        doc.text(`${index + 1}. ${item.name}`, 20, y);
        doc.setFontSize(10);
        doc.text(`   Categoria: ${item.category}`, 20, y + 5);
        doc.text(`   Necesitas: ${needed > 0 ? needed.toFixed(1) : 'Reponer'} ${item.unit || 'unidades'}`, 20, y + 10);
        if (item.price) {
            doc.text(`   Ultimo precio: ${currencySymbol} ${item.price.toFixed(2)}`, 20, y + 15);
            y += 22;
        } else {
            y += 17;
        }
        doc.setFontSize(12);
    });
    
    doc.save(`lista-compras-${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('PDF generado correctamente');
}

function exportToExcel() {
    const shoppingItems = items.filter(item => item.stock <= item.minStock);
    
    if (shoppingItems.length === 0) {
        showToast('No hay artículos para exportar');
        return;
    }
    
    const currencySymbol = getCurrencySymbol();
    let csv = `Nombre,Categoría,Stock Actual,Unidad,Stock Mínimo,Cantidad Necesaria,Último Precio (${currencySymbol})\n`;
    
    shoppingItems.forEach(item => {
        const needed = Math.max(0, item.minStock - item.stock);
        csv += `"${item.name}","${item.category}",${item.stock},"${item.unit || 'unidades'}",${item.minStock},${needed.toFixed(1)},${item.price || 0}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lista-compras-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showToast('Excel generado correctamente');
}

// Settings
function renderSettings() {
    const container = document.getElementById('categoryList');
    container.innerHTML = categories.map(cat => `
        <div class="category-tag">
            <span>${cat}</span>
            ${categories.length > 1 ? `<button class="delete-category" onclick="deleteCategory('${cat}')">×</button>` : ''}
        </div>
    `).join('');
    
    // Load saved currency
    document.getElementById('currencySelect').value = currentCurrency;
    
    // Update sync UI
    updateSyncUI();
    
    // Show install options
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (isStandalone) {
        // Already installed, hide both cards
        document.getElementById('installCard').style.display = 'none';
        document.getElementById('iosInstallCard').style.display = 'none';
    } else if (isIOS) {
        // Show iOS instructions
        document.getElementById('installCard').style.display = 'none';
        document.getElementById('iosInstallCard').style.display = 'block';
    } else if (deferredPrompt) {
        // Show install button for Android/Desktop
        document.getElementById('installCard').style.display = 'block';
        document.getElementById('iosInstallCard').style.display = 'none';
    }
}

function addCategory() {
    const input = document.getElementById('newCategoryInput');
    const newCategory = input.value.trim();
    
    if (!newCategory) return;
    
    if (categories.includes(newCategory)) {
        showToast('Esta categoría ya existe');
        return;
    }
    
    categories.push(newCategory);
    saveToStorage();
    syncToFirebase();
    input.value = '';
    renderSettings();
    showToast('Categoría agregada');
}

function deleteCategory(category) {
    if (categories.length === 1) {
        showToast('Debe haber al menos una categoría');
        return;
    }
    
    const itemsInCategory = items.filter(i => i.category === category);
    if (itemsInCategory.length > 0) {
        showToast(`No se puede eliminar: hay ${itemsInCategory.length} artículo(s) en esta categoría`);
        return;
    }
    
    categories = categories.filter(c => c !== category);
    saveToStorage();
    syncToFirebase();
    renderSettings();
    showToast('Categoría eliminada');
}

function clearAllData() {
    showConfirmModal(
        '⚠️ Borrar Todos los Datos',
        '<p style="color: var(--danger); font-weight: 600; margin-bottom: 12px;">ADVERTENCIA: Esta acción es irreversible</p><p>Se eliminarán todos los artículos, recetas, categorías y configuraciones.</p><p style="margin-top: 12px;">¿Estás seguro de continuar?</p>',
        (confirmed) => {
            if (confirmed) {
                showConfirmModal(
                    '⚠️ Confirmación Final',
                    '<p style="color: var(--danger); font-weight: 600;">¿Estás REALMENTE seguro?</p><p style="margin-top: 12px;">Esta acción no se puede deshacer.</p>',
                    (reallyConfirmed) => {
                        if (reallyConfirmed) {
                            items = [];
                            categories = ['Carnes', 'Verduras', 'Despensa', 'Higiene', 'Limpieza', 'Lácteos', 'Bebidas'];
                            saveToStorage();
                            syncToFirebase();
                            renderDashboard();
                            renderItems();
                            renderSettings();
                            showToast('Todos los datos han sido eliminados');
                        }
                    }
                );
            }
        }
    );
}

// Toast Notifications
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideUpToast 0.3s reverse';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// PWA Installation
let deferredPrompt;

// Create manifest dynamically
const manifest = {
    name: "StockEz - Gestión de Despensa",
    short_name: "StockEz",
    description: "Gestiona el stock de tu hogar con alertas de caducidad",
    start_url: "./",
    display: "standalone",
    background_color: "#1A1F2E",
    theme_color: "#2DD881",
    orientation: "portrait-primary",
    icons: [
        {
            src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect fill='%232DD881' width='192' height='192' rx='40'/><text x='96' y='140' font-size='120' text-anchor='middle' fill='white'>🏡</text></svg>",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any maskable"
        },
        {
            src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect fill='%232DD881' width='512' height='512' rx='100'/><text x='256' y='380' font-size='320' text-anchor='middle' fill='white'>🏡</text></svg>",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable"
        }
    ]
};

const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
const manifestURL = URL.createObjectURL(manifestBlob);
document.getElementById('manifest-placeholder').setAttribute('href', manifestURL);

// Register Service Worker
if ('serviceWorker' in navigator) {
    const swCode = `
        const CACHE_NAME = 'stockhogar-v1';
        const urlsToCache = ['./', '/'];
        
        self.addEventListener('install', (event) => {
            event.waitUntil(
                caches.open(CACHE_NAME)
                    .then((cache) => cache.addAll(urlsToCache))
            );
            self.skipWaiting();
        });
        
        self.addEventListener('fetch', (event) => {
            event.respondWith(
                caches.match(event.request)
                    .then((response) => response || fetch(event.request))
            );
        });
        
        self.addEventListener('activate', (event) => {
            event.waitUntil(
                caches.keys().then((cacheNames) => {
                    return Promise.all(
                        cacheNames.map((cacheName) => {
                            if (cacheName !== CACHE_NAME) {
                                return caches.delete(cacheName);
                            }
                        })
                    );
                })
            );
            self.clients.claim();
        });
    `;
    
    const swBlob = new Blob([swCode], { type: 'application/javascript' });
    const swURL = URL.createObjectURL(swBlob);
    
    navigator.serviceWorker.register(swURL)
        .then(() => console.log('✓ Service Worker registrado'))
        .catch((err) => console.log('Service Worker error:', err));
}

// Install prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
});

function showInstallBanner() {
    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.innerHTML = `
        <div style="position: fixed; top: 70px; left: 20px; right: 20px; background: linear-gradient(135deg, var(--primary-dark), var(--primary)); padding: 16px 20px; border-radius: 16px; box-shadow: 0 8px 24px var(--shadow); z-index: 999; display: flex; align-items: center; gap: 12px; animation: slideDown 0.3s;">
            <div style="flex: 1; color: white;">
                <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">📱 Instalar StockEz</div>
                <div style="font-size: 12px; opacity: 0.9;">Acceso rápido desde tu pantalla de inicio</div>
            </div>
            <button onclick="installPWA()" style="background: white; color: var(--primary-dark); border: none; padding: 10px 20px; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; white-space: nowrap;">Instalar</button>
            <button onclick="dismissInstallBanner()" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 10px; border-radius: 10px; font-size: 18px; cursor: pointer; width: 36px; height: 36px;">×</button>
        </div>
    `;
    document.body.appendChild(banner);
}

window.installPWA = async function() {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
        showToast('¡App instalada correctamente! ✓');
    }
    
    deferredPrompt = null;
    dismissInstallBanner();
};

window.dismissInstallBanner = function() {
    const banner = document.getElementById('install-banner');
    if (banner) banner.remove();
};

// ========================================
// RECIPES SYSTEM WITH AI
// ========================================

async function generateRecipeWithAI() {
    if (!anthropicApiKey) {
        showToast('⚠️ Configura tu API key de Anthropic en config.js');
        console.error('API key de Anthropic no configurada. Edita config.js y agrega tu API key.');
        return;
    }
    
    // Get available ingredients
    const availableItems = items.filter(item => item.stock > 0);
    
    if (availableItems.length === 0) {
        showToast('No tienes ingredientes en stock');
        return;
    }
    
    // Show loading state
    const container = document.getElementById('recipesContainer');
    container.innerHTML = `
        <div class="generating-spinner">
            <div class="spinner"></div>
            <p style="margin-top: 20px; color: var(--text-secondary);">Generando receta con IA...</p>
        </div>
    `;
    
    try {
        const ingredients = availableItems.map(item => 
            `${item.name} (${item.stock} ${item.unit})`
        ).join(', ');
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicApiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1500,
                messages: [{
                    role: 'user',
                    content: `Crea UNA SOLA receta deliciosa usando SOLO estos ingredientes disponibles: ${ingredients}. 

IMPORTANTE: 
- Usa SOLO ingredientes de la lista
- Si faltan ingredientes básicos (sal, aceite, agua), puedes mencionarlos
- Responde SOLO en formato JSON válido, sin markdown, sin comentarios
- No agregues texto antes ni después del JSON

Formato JSON requerido:
{
  "nombre": "Nombre de la receta",
  "descripcion": "Breve descripción atractiva",
  "ingredientes": [
    {"nombre": "ingrediente", "cantidad": "100g", "disponible": true}
  ],
  "pasos": [
    "Paso 1...",
    "Paso 2..."
  ],
  "tiempo": "30 minutos",
  "porciones": "4 porciones"
}`
                }]
            })
        });
        
        console.log('Status de respuesta:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error de la API:', errorData);
            throw new Error(`Error ${response.status}: ${errorData.error?.message || 'Error en la API de Anthropic'}`);
        }
        
        const data = await response.json();
        console.log('Respuesta de la API:', data);
        
        const recipeText = data.content[0].text;
        console.log('Texto de receta:', recipeText);
        
        // Limpiar el texto de markdown y otros extras
        let cleanedText = recipeText.trim();
        
        // Remover bloques de código markdown (```json ... ```)
        cleanedText = cleanedText.replace(/```json\s*/g, '');
        cleanedText = cleanedText.replace(/```\s*/g, '');
        
        // Buscar el JSON (entre { y })
        const jsonStart = cleanedText.indexOf('{');
        const jsonEnd = cleanedText.lastIndexOf('}') + 1;
        
        if (jsonStart === -1 || jsonEnd === 0) {
            throw new Error('No se encontró JSON válido en la respuesta');
        }
        
        cleanedText = cleanedText.substring(jsonStart, jsonEnd);
        console.log('JSON limpio:', cleanedText);
        
        // Parse JSON from response
        const recipe = JSON.parse(cleanedText);
        
        // Save recipe
        const newRecipe = {
            id: Date.now().toString(),
            ...recipe,
            aiGenerated: true,
            favorite: false,
            createdAt: new Date().toISOString()
        };
        
        recipes.push(newRecipe);
        localStorage.setItem('recipes', JSON.stringify(recipes));
        
        renderRecipes();
        showToast('✓ Receta generada exitosamente');
        
    } catch (error) {
        console.error('Error completo generando receta:', error);
        console.error('Tipo de error:', error.name);
        console.error('Mensaje:', error.message);
        
        renderRecipes();
        
        // Mensaje más específico según el tipo de error
        let errorMsg = '⚠️ Error generando receta';
        if (error.message.includes('API')) {
            errorMsg += '. Verifica tu API key';
        } else if (error.message.includes('JSON')) {
            errorMsg += '. Error en formato de respuesta';
        } else if (error.message.includes('Network') || error.message.includes('fetch')) {
            errorMsg += '. Error de conexión';
        }
        
        showToast(errorMsg);
        
        // Mostrar error detallado en consola para debugging
        console.log('=== DEBUG INFO ===');
        console.log('API Key configurada:', anthropicApiKey ? 'Sí (largo: ' + anthropicApiKey.length + ')' : 'No');
        console.log('Error stack:', error.stack);
    }
}

function renderRecipes() {
    const container = document.getElementById('recipesContainer');
    
    let filteredRecipes = recipes;
    if (currentRecipeFilter === 'favorites') {
        filteredRecipes = recipes.filter(r => r.favorite);
    } else if (currentRecipeFilter === 'generated') {
        filteredRecipes = recipes.filter(r => r.aiGenerated);
    }
    
    if (filteredRecipes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👨‍🍳</div>
                <p>No hay recetas${currentRecipeFilter !== 'all' ? ' en esta categoría' : ''}</p>
                ${currentRecipeFilter === 'all' ? '<p style="font-size: 14px; margin-top: 12px; color: var(--text-secondary);">Toca "🤖 Generar" para crear una receta con IA</p>' : ''}
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredRecipes.map(recipe => renderRecipeCard(recipe)).join('');
}

function renderRecipeCard(recipe) {
    const availableIngredients = items.filter(item => item.stock > 0).map(i => i.name.toLowerCase());
    const ingredientsPreview = recipe.ingredientes.slice(0, 3).map(ing => {
        const available = availableIngredients.some(ai => 
            ai.includes(ing.nombre.toLowerCase()) || ing.nombre.toLowerCase().includes(ai)
        );
        return `<span class="ingredient-tag ${available ? 'available' : ''}">${ing.nombre}</span>`;
    }).join('');
    
    const moreCount = recipe.ingredientes.length > 3 ? ` +${recipe.ingredientes.length - 3}` : '';
    
    return `
        <div class="recipe-card" onclick="viewRecipeDetail('${recipe.id}')">
            <div class="recipe-header">
                <div class="recipe-title">${recipe.nombre}</div>
                <div class="recipe-favorite" onclick="event.stopPropagation(); toggleFavorite('${recipe.id}')">
                    ${recipe.favorite ? '⭐' : '☆'}
                </div>
            </div>
            <div class="recipe-description">${recipe.descripcion}</div>
            <div style="display: flex; gap: 8px; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
                <span>⏱️ ${recipe.tiempo || 'N/A'}</span>
                <span>•</span>
                <span>🍽️ ${recipe.porciones || 'N/A'}</span>
            </div>
            <div class="recipe-ingredients-preview">
                ${ingredientsPreview}${moreCount}
            </div>
            ${recipe.aiGenerated ? '<div class="recipe-ai-badge">🤖 Generada con IA</div>' : ''}
        </div>
    `;
}

function filterRecipes(filter) {
    currentRecipeFilter = filter;
    
    // Update filter chips
    document.querySelectorAll('#recipesPage .filter-chip').forEach(chip => {
        chip.classList.remove('active');
    });
    document.getElementById(`filter-${filter}`).classList.add('active');
    
    renderRecipes();
}

function toggleFavorite(id) {
    const recipe = recipes.find(r => r.id === id);
    if (recipe) {
        recipe.favorite = !recipe.favorite;
        localStorage.setItem('recipes', JSON.stringify(recipes));
        renderRecipes();
    }
}

function viewRecipeDetail(id) {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    
    const availableIngredients = items.filter(item => item.stock > 0).map(i => i.name.toLowerCase());
    
    const ingredientsList = recipe.ingredientes.map(ing => {
        const available = availableIngredients.some(ai => 
            ai.includes(ing.nombre.toLowerCase()) || ing.nombre.toLowerCase().includes(ai)
        );
        return `
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-input); border-radius: 6px; margin-bottom: 6px;">
                <span style="font-size: 18px;">${available ? '✅' : '❌'}</span>
                <span style="flex: 1;">${ing.cantidad} ${ing.nombre}</span>
            </div>
        `;
    }).join('');
    
    const stepsList = recipe.pasos.map((paso, index) => `
        <div class="recipe-step">
            <span class="recipe-step-number">Paso ${index + 1}:</span>
            <span>${paso}</span>
        </div>
    `).join('');
    
    document.getElementById('recipeTitle').textContent = recipe.nombre;
    document.getElementById('recipeDetailContent').innerHTML = `
        <div class="recipe-detail-section">
            <p style="color: var(--text-secondary); line-height: 1.6;">${recipe.descripcion}</p>
            <div style="display: flex; gap: 16px; margin-top: 12px; padding: 12px; background: var(--bg-input); border-radius: 8px;">
                <span>⏱️ ${recipe.tiempo || 'N/A'}</span>
                <span>🍽️ ${recipe.porciones || 'N/A'}</span>
            </div>
        </div>
        
        <div class="recipe-detail-section">
            <div class="recipe-detail-title">📝 Ingredientes</div>
            ${ingredientsList}
        </div>
        
        <div class="recipe-detail-section">
            <div class="recipe-detail-title">👨‍🍳 Preparación</div>
            ${stepsList}
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 24px;">
            <button class="btn btn-danger" onclick="deleteRecipe('${recipe.id}')" style="flex: 1;">
                🗑️ Eliminar
            </button>
            <button class="btn btn-primary" onclick="closeRecipeModal()" style="flex: 1;">
                Cerrar
            </button>
        </div>
    `;
    
    document.getElementById('recipeModal').classList.add('active');
}

function closeRecipeModal() {
    document.getElementById('recipeModal').classList.remove('active');
}

function deleteRecipe(id) {
    const recipe = recipes.find(r => r.id === id);
    showConfirmModal(
        '🗑️ Eliminar Receta',
        `<p>¿Estás seguro de eliminar la receta <strong>"${recipe?.nombre || 'esta receta'}"</strong>?</p><p style="margin-top: 12px; color: var(--text-secondary);">Esta acción no se puede deshacer.</p>`,
        (confirmed) => {
            if (confirmed) {
                recipes = recipes.filter(r => r.id !== id);
                localStorage.setItem('recipes', JSON.stringify(recipes));
                closeRecipeModal();
                renderRecipes();
                showToast('Receta eliminada');
            }
        }
    );
}

// Initialize
initFirebase();
renderDashboard();
renderItems();