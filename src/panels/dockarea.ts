/*-----------------------------------------------------------------------------
| Copyright (c) 2014, S. Chris Colbert
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
module phosphor.panels {

import IDisposable = core.IDisposable;

import hitTest = domutil.hitTest;
import overrideCursor = domutil.overrideCursor;


/**
 * The class name added to DockArea instances.
 */
var DOCK_AREA_CLASS = 'p-DockArea';

/**
 * The class name added to floating tabs.
 */
var FLOATING_CLASS = 'p-mod-floating';


/**
 * A panel which provides a flexible layout area for panels.
 */
export
class DockArea extends Panel {
  /**
   * Construct a new dock area.
   */
  constructor() {
    super();
    this.node.classList.add(DOCK_AREA_CLASS);
    this._root = this._createSplitter(Orientation.Horizontal);
    this.layout = new SingleLayout(this._root);
    this.setFlag(PanelFlag.DisallowLayoutChange);
  }

  /**
   * Dispose of the resources held by the panel.
   */
  dispose(): void {
    this._abortDrag();
    this._root = null;
    this._items = null;
    super.dispose();
  }

  /**
   * Get the width of the tabs in the dock area.
   */
  get tabWidth(): number {
    return this._tabWidth;
  }

  /**
   * Get the width of the tabs in the dock area.
   */
  set tabWidth(width: number) {
    width = Math.max(0, width);
    if (width === this._tabWidth) {
      return;
    }
    this._tabWidth = width;
    iterPanels(this._root, panel => {
      panel.tabBar.tabWidth = width;
    });
  }

  /**
   * Get the minimum tab width in pixels.
   */
  get minTabWidth(): number {
    return this._minTabWidth;
  }

  /**
   * Set the minimum tab width in pixels.
   */
  set minTabWidth(width: number) {
    width = Math.max(0, width);
    if (width === this._minTabWidth) {
      return;
    }
    this._minTabWidth = width;
    iterPanels(this._root, panel => {
      panel.tabBar.minTabWidth = width;
    });
  }

  /**
   * Get the tab overlap amount in pixels.
   */
  get tabOverlap(): number {
    return this._tabOverlap;
  }

  /**
   * Set the tab overlap amount in pixels.
   */
  set tabOverlap(overlap: number) {
    if (overlap === this._tabOverlap) {
      return;
    }
    this._tabOverlap = overlap;
    iterPanels(this._root, panel => {
      panel.tabBar.tabOverlap = overlap;
    });
  }

  /**
   * Get the handle size of the dock splitters.
   */
  get handleSize(): number {
    return this._handleSize;
  }

  /**
   * Set the handle size of the dock splitters.
   */
  set handleSize(size: number) {
    if (size === this._handleSize) {
      return;
    }
    this._handleSize = size;
    iterSplitters(this._root, splitter => {
      splitter.handleSize = size;
    });
  }

  /**
   * Add a panel to the dock area.
   *
   * The panel is positioned in the area according to the given dock
   * mode and reference panel. If the dock panel is already added to
   * the area, it will be moved to the new location.
   *
   * The default mode inserts the panel on the left side of the area.
   */
  addPanel(panel: ITabbable, mode?: DockMode, ref?: ITabbable): void {
    switch (mode) {
      case DockMode.Top:
        this._addWidget(panel, Orientation.Vertical, false);
        break;
      case DockMode.Left:
        this._addWidget(panel, Orientation.Horizontal, false);
        break;
      case DockMode.Right:
        this._addWidget(panel, Orientation.Horizontal, true);
        break;
      case DockMode.Bottom:
        this._addWidget(panel, Orientation.Vertical, true);
        break;
      case DockMode.SplitTop:
        this._splitWidget(panel, ref, Orientation.Vertical, false);
        break;
      case DockMode.SplitLeft:
        this._splitWidget(panel, ref, Orientation.Horizontal, false);
        break;
      case DockMode.SplitRight:
        this._splitWidget(panel, ref, Orientation.Horizontal, true);
        break;
      case DockMode.SplitBottom:
        this._splitWidget(panel, ref, Orientation.Vertical, true);
        break;
      case DockMode.TabBefore:
        this._tabifyWidget(panel, ref, false);
        break;
      case DockMode.TabAfter:
        this._tabifyWidget(panel, ref, true);
        break;
      default:
        this._addWidget(panel, Orientation.Horizontal, false);
        break;
    }
  }

  // /**
  //  * Ensure the given widget is activated.
  //  *
  //  * If the widget does not exist, this is a no-op.
  //  *
  //  * Returns true if the widget was activated, false otherwise.
  //  */
  // activateWidget(widget: Widget): boolean {
  //   var item = find(this._items, it => it.widget === widget);
  //   if (!item) {
  //     return false;
  //   }
  //   item.panel.tabBar.currentTab = item.widget.tab;
  //   return true;
  // }

  // /**
  //  * Get an array of the active widgets in the dock area.
  //  */
  // activeWidgets(): Widget[] {
  //   var result: Widget[] = [];
  //   iterPanels(this._root, panel => {
  //     var current = panel.stackPanel.currentPanel;
  //     if (current) result.push(current);
  //   });
  //   return result;
  // }

  /**
   * Handle the DOM events for the dock area.
   */
  protected handleEvent(event: Event): void {
    switch (event.type) {
      case 'mousemove':
        this.domEvent_mousemove(<MouseEvent>event);
        break;
      case 'mouseup':
        this.domEvent_mouseup(<MouseEvent>event);
        break;
      case 'contextmenu':
        event.preventDefault();
        event.stopPropagation();
        break;
      default:
        break;
    }
  }

  /**
   * Handle the 'mousemove' event for the dock area.
   *
   * This is triggered on the document during a tab move operation.
   */
  protected domEvent_mousemove(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    var dragData = this._dragData;
    if (!dragData) {
      return;
    }

    // Hit test the panels using the current mouse position.
    var clientX = event.clientX;
    var clientY = event.clientY;
    var hitPanel = iterPanels(this._root, p => {
      return hitTest(p.node, clientX, clientY) ? p : void 0;
    });

    // If the last hit panel is not this hit panel, clear the overlay.
    if (dragData.lastHitPanel && dragData.lastHitPanel !== hitPanel) {
      dragData.lastHitPanel.hideOverlay();
    }

    // Clear the reference to the hit panel. It will be updated again
    // if the mouse is over a panel, but not over the panel's tab bar.
    dragData.lastHitPanel = null;

    // Compute the new X and Y tab coordinates.
    var x = clientX - dragData.offsetX;
    var y = clientY - dragData.offsetY;

    // If the mouse is not over a dock panel, simply update the tab.
    var item = dragData.item;
    var itemTab = item.widget.tab;
    var tabStyle = itemTab.node.style;
    if (!hitPanel) {
      tabStyle.left = x + 'px';
      tabStyle.top = y + 'px';
      return;
    }

    // Handle the case where the mouse is not over a tab bar. This
    // saves a reference to the hit panel so that its overlay can be
    // hidden once the mouse leaves the area, and shows the overlay
    // provided that the split target is not the current widget.
    if (!hitTest(hitPanel.tabBar.node, clientX, clientY)) {
      dragData.lastHitPanel = hitPanel;
      if (hitPanel !== item.panel || hitPanel.tabBar.count > 0) {
        hitPanel.showOverlay(clientX, clientY);
      }
      tabStyle.left = x + 'px';
      tabStyle.top = y + 'px';
      return;
    }

    // Otherwise the mouse is positioned over a tab bar. Hide the
    // overlay before attaching the tab to the new tab bar.
    hitPanel.hideOverlay();

    // If the hit panel is not the current owner, the current hit
    // panel and tab are saved so that they can be restored later.
    if (hitPanel !== item.panel) {
      dragData.tempPanel = hitPanel;
      dragData.tempTab = hitPanel.tabBar.currentTab;
    }

    // Reset the tab style before attaching the tab to the tab bar.
    floatTab(itemTab, false);
    tabStyle.top = '';
    tabStyle.left = '';
    tabStyle.width = '';

    // Attach the tab to the hit tab bar.
    hitPanel.tabBar.attachTab({
      tab: itemTab,
      clientX: clientX,
      clientY: clientY,
      offsetX: dragData.offsetX,
      offsetY: dragData.offsetY,
      tabWidth: dragData.tabWidth,
    });

    // The tab bar takes over movement of the tab. The dock area still
    // listens for the mouseup event in order to complete the move.
    document.removeEventListener('mousemove', <any>this, true);
  }

  /**
   * Handle the 'mouseup' event for the dock area.
   *
   * This is triggered on the document during a tab move operation.
   */
  protected domEvent_mouseup(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    document.removeEventListener('mouseup', <any>this, true);
    document.removeEventListener('mousemove', <any>this, true);
    document.removeEventListener('contextmenu', <any>this, true);
    var dragData = this._dragData;
    if (!dragData) {
      return;
    }
    this._dragData = null;

    // Restore the application cursor and hide the overlay.
    dragData.grab.dispose();
    if (dragData.lastHitPanel) {
      dragData.lastHitPanel.hideOverlay();
    }

    // Fetch common variables.
    var item = dragData.item;
    var ownPanel = item.panel;
    var ownBar = ownPanel.tabBar;
    var ownCount = ownBar.count;
    var itemTab = item.widget.tab;

    // If the tab was being temporarily borrowed by another panel,
    // make that relationship permanent by moving the dock widget.
    // If the original owner panel becomes empty, it is removed.
    // Otherwise, its current index is updated to the next widget.
    //
    // The ignoreRemoved flag is set during the widget swap since
    // the widget is not actually being removed from the area.
    if (dragData.tempPanel) {
      item.panel = dragData.tempPanel;
      this._ignoreRemoved = true;
      item.panel.stackPanel.addPanel(item.widget);
      this._ignoreRemoved = false;
      item.panel.stackPanel.currentPanel = item.widget;
      if (ownPanel.stackPanel.count === 0) {
        this._removePanel(ownPanel);
      } else {
        var i = ownBar.tabIndex(dragData.prevTab);
        if (i === -1) i = Math.min(dragData.index, ownCount - 1);
        ownBar.currentIndex = i;
      }
      return;
    }

    // Snap the split mode before modifying the DOM with the tab insert.
    var mode = SplitMode.Invalid;
    var hitPanel = dragData.lastHitPanel;
    if (hitPanel && (hitPanel !== ownPanel || ownCount !== 0)) {
      mode = hitPanel.splitModeAt(event.clientX, event.clientY);
    }

    // If the mouse was not released over a panel, or if the hit panel
    // is the empty owner panel, restore the tab to its position.
    var tabStyle = itemTab.node.style;
    if (mode === SplitMode.Invalid) {
      if (ownBar.currentTab !== itemTab) {
        floatTab(itemTab, false);
        tabStyle.top = '';
        tabStyle.left = '';
        tabStyle.width = '';
        ownBar.insertTab(dragData.index, itemTab);
      }
      return;
    }

    // Remove the tab from the document body and reset its style.
    document.body.removeChild(itemTab.node);
    floatTab(itemTab, false);
    tabStyle.top = '';
    tabStyle.left = '';
    tabStyle.width = '';

    // Split the target panel with the dock widget.
    var after = mode === SplitMode.Right || mode === SplitMode.Bottom;
    var horiz = mode === SplitMode.Left || mode === SplitMode.Right;
    var orientation = horiz ? Orientation.Horizontal : Orientation.Vertical;
    this._splitPanel(hitPanel, item.widget, orientation, after);
    var i = ownBar.tabIndex(dragData.prevTab);
    if (i === -1) i = Math.min(dragData.index, ownCount - 1);
    ownBar.currentIndex = i;
  }

  /**
   * Add the widget to a new root dock panel along the given orientation.
   *
   * If the widget already exists in the area, it will be removed.
   */
  private _addWidget(widget: ITabbable, orientation: Orientation, after: boolean): void {
    widget.parent = null;
    var panel = this._createPanel();
    this._addItem(widget, panel);
    panel.stackPanel.addPanel(widget);
    panel.tabBar.addTab(widget.tab);
    this._ensureRoot(orientation);
    if (after) {
      this._root.addPanel(panel);
    } else {
      this._root.insertPanel(0, panel);
    }
  }

  /**
   * Add the dock widget as a new split panel next to the reference.
   *
   * If the reference does not exist in the area, this is a no-op.
   *
   * If the dock widget already exists in the area, it will be moved.
   */
  private _splitWidget(widget: ITabbable, ref: ITabbable, orientation: Orientation, after: boolean): void {
    if (widget === ref) {
      return;
    }
    var refItem = find(this._items, it => it.widget === ref);
    if (!refItem) {
      return;
    }
    this._splitPanel(refItem.panel, widget, orientation, after);
  }

  /**
   * Split the panel with the given widget along the given orientation.
   *
   * If the widget already exists in the area, it will be moved.
   */
  private _splitPanel(panel: DockPanel, widget: ITabbable, orientation: Orientation, after: boolean): void {
    widget.parent = null;
    var newPanel = this._createPanel();
    this._addItem(widget, newPanel);
    newPanel.stackPanel.addPanel(widget);
    newPanel.tabBar.addTab(widget.tab);
    var splitter = <DockSplitter>panel.parent;
    if (splitter.orientation !== orientation) {
      if (splitter.count <= 1) {
        splitter.orientation = orientation;
        splitter.insertPanel(after ? 1 : 0, newPanel);
        splitter.setSizes([1, 1]);
      } else {
        var sizes = splitter.sizes();
        var index = splitter.indexOf(panel);
        panel.parent = null;
        var newSplitter = this._createSplitter(orientation);
        newSplitter.addPanel(panel);
        newSplitter.insertPanel(after ? 1 : 0, newPanel);
        splitter.insertPanel(index, newSplitter);
        splitter.setSizes(sizes);
        newSplitter.setSizes([1, 1]);
      }
    } else {
      var sizes = splitter.sizes();
      var index = splitter.indexOf(panel);
      splitter.insertPanel(index + (after ? 1 : 0), newPanel);
      sizes.splice(index, 0, 1 / sizes.length);
      splitter.setSizes(sizes);
    }
  }

  /**
   * Add the dock widget as a tab next to the reference.
   *
   * If the reference does not exist in the area, this is a no-op.
   *
   * If the dock widget already exists in the area, it will be moved.
   */
  private _tabifyWidget(widget: ITabbable, ref: ITabbable, after: boolean): void {
    if (widget === ref) {
      return;
    }
    var refItem = find(this._items, it => it.widget === ref);
    if (!refItem) {
      return;
    }
    widget.parent = null;
    var panel = refItem.panel;
    var index = panel.tabBar.tabIndex(ref.tab) + (after ? 1 : 0);
    this._addItem(widget, panel);
    panel.stackPanel.addPanel(widget);
    panel.tabBar.insertTab(index, widget.tab);
  }

  /**
   * Ensure the root splitter has the given orientation.
   *
   * If the current root has the given orientation, this is a no-op.
   *
   * If the root has <= 1 child, its orientation will be updated.
   *
   * Otherwise, a new root will be created with the proper orientation
   * and the current root will be added as the new root's first child.
   */
  private _ensureRoot(orientation: Orientation): void {
    var root = this._root;
    if (root.orientation === orientation) {
      return;
    }
    if (root.count <= 1) {
      root.orientation = orientation;
    } else {
      this._root = this._createSplitter(orientation);
      this._root.addPanel(root);
      (<SingleLayout>this.layout).panel = this._root;
    }
  }

  /**
   * Add a new item to the dock area and install its signal handlers.
   */
  private _addItem(widget: ITabbable, panel: DockPanel): void {
    this._items.push({ widget: widget, panel: panel });
  }

  /**
   * Create a new panel and setup the signal handlers.
   */
  private _createPanel(): DockPanel {
    var panel = new DockPanel();
    var tabBar = panel.tabBar;
    tabBar.tabWidth = this._tabWidth;
    tabBar.tabOverlap = this._tabOverlap;
    tabBar.minTabWidth = this._minTabWidth;
    tabBar.currentChanged.connect(this._tb_currentChanged, this);
    tabBar.tabCloseRequested.connect(this._tb_tabCloseRequested, this);
    tabBar.tabDetachRequested.connect(this._tb_tabDetachRequested, this);
    panel.stackPanel.panelRemoved.connect(this._sw_widgetRemoved, this);
    return panel;
  }

  /**
   * Create a new dock splitter for the dock area.
   */
  private _createSplitter(orientation: Orientation): DockSplitter {
    var splitter = new DockSplitter(orientation);
    splitter.handleSize = this._handleSize;
    return splitter;
  }

  /**
   * Remove an empty dock panel from the hierarchy.
   *
   * This ensures that the hierarchy is kept consistent by merging an
   * ancestor splitter when it contains only a single child widget.
   */
  private _removePanel(panel: DockPanel): void {
    // The parent of a dock panel is always a splitter.
    var splitter = <DockSplitter>panel.parent;

    // Dispose the panel. It is possible that this method is executing
    // on the path of the panel's child stack widget event handler, so
    // the panel is disposed in a deferred fashion to avoid disposing
    // the child stack widget while its processing events.
    panel.parent = null;
    setTimeout(() => panel.dispose(), 0);

    // If the splitter still has multiple children after removing
    // the target panel, nothing else needs to be done.
    if (splitter.count > 1) {
      return;
    }

    // If the splitter is the root splitter and has a remaining
    // child which is a splitter, that child becomes the root.
    if (splitter === this._root) {
      if (splitter.count === 1) {
        var child = splitter.panelAt(0);
        if (child instanceof DockSplitter) {
          var layout = <SingleLayout>this.layout;
          var sizes = child.sizes();
          this._root = child;
          splitter.parent = null;
          layout.panel = child;
          child.setSizes(sizes);
          splitter.dispose();
        }
      }
      return;
    }

    // Non-root splitters always have a splitter parent and are always
    // created with 2 children, so the splitter is guaranteed to have
    // a single child at this point. Furthermore, splitters always have
    // an orthogonal orientation to their parent, so a grandparent and
    // a grandhild splitter will have the same orientation. This means
    // the children of the granchild can be merged into the grandparent.
    var gParent = <DockSplitter>splitter.parent;
    var gSizes = gParent.sizes();
    var gChild = splitter.panelAt(0);
    var index = gParent.indexOf(splitter);
    splitter.parent = null;
    if (gChild instanceof DockPanel) {
      gParent.insertPanel(index, gChild);
    } else {
      var gcsp = <DockSplitter>gChild;
      var gcspSizes = gcsp.sizes();
      var sizeShare = gSizes.splice(index, 1)[0];
      for (var i = 0; gcsp.count !== 0; ++i) {
        gParent.insertPanel(index + i, gcsp.panelAt(0));
        gSizes.splice(index + i, 0, sizeShare * gcspSizes[i]);
      }
    }
    gParent.setSizes(gSizes);
    splitter.dispose();
  }

  /**
   * Abort the tab drag operation if one is in progress.
   */
  private _abortDrag(): void {
    var dragData = this._dragData;
    if (!dragData) {
      return;
    }
    this._dragData = null;

    // Release the mouse grab and restore the application cursor.
    document.removeEventListener('mouseup', <any>this, true);
    document.removeEventListener('mousemove', <any>this, true);
    document.removeEventListener('contextmenu', <any>this, true);
    dragData.grab.dispose();

    // Hide the overlay for the last hit panel.
    if (dragData.lastHitPanel) {
      dragData.lastHitPanel.hideOverlay();
    }

    // If the tab is borrowed by another tab bar, remove it from
    // that tab bar and restore that tab bar's previous tab.
    if (dragData.tempPanel) {
      var tabBar = dragData.tempPanel.tabBar;
      tabBar.takeAt(tabBar.currentIndex, false);
      tabBar.currentTab = dragData.tempTab;
    }

    // Restore the tab to its original location in its owner panel.
    var item = dragData.item;
    var itemTab = item.widget.tab;
    var ownBar = item.panel.tabBar;
    if (ownBar.currentTab !== itemTab) {
      var tabStyle = itemTab.node.style;
      floatTab(itemTab, false);
      tabStyle.top = '';
      tabStyle.left = '';
      tabStyle.width = '';
      ownBar.insertTab(dragData.index, itemTab);
    }
  }

  /**
   * Handle the `currentChanged` signal from a tab bar.
   */
  private _tb_currentChanged(sender: TabBar, args: ITabIndexArgs): void {
    var item = find(this._items, it => it.widget.tab === args.tab);
    if (item && item.panel.tabBar === sender) {
      item.panel.stackPanel.currentPanel = item.widget;
    }
  }

  /**
   * Handle the `tabCloseRequested` signal from a tab bar.
   */
  private _tb_tabCloseRequested(sender: TabBar, args: ITabIndexArgs): void {
    var item = find(this._items, it => it.widget.tab === args.tab);
    if (item) item.widget.close();
  }

  /**
   * Handle the `tabDetachRequested` signal from the tab bar.
   */
  private _tb_tabDetachRequested(sender: TabBar, args: ITabDetachArgs): void {
    // Find the dock item for the detach operation.
    var tab = args.tab;
    var item = find(this._items, it => it.widget.tab === tab);
    if (!item) {
      return;
    }

    // Create the drag data the first time a tab is detached.
    // The drag data will be cleared on the mouse up event.
    if (!this._dragData) {
      var prevTab = sender.previousTab;
      var grab = overrideCursor(window.getComputedStyle(tab.node).cursor);
      this._dragData = {
        item: item,
        index: args.index,
        tabWidth: 0,
        offsetX: 0,
        offsetY: 0,
        grab: grab,
        prevTab: prevTab,
        lastHitPanel: null,
        tempPanel: null,
        tempTab: null,
      };
    }

    // Update the drag data with the current tab geometry.
    var dragData = this._dragData;
    dragData.tabWidth = args.tabWidth;
    dragData.offsetX = args.offsetX;
    dragData.offsetY = args.offsetY;

    // The tab being detached will have one of two states:
    //
    // 1) The tab is being detached from its owner tab bar. The current
    //    index is unset before detaching the tab so that the content
    //    widget does not change during the drag operation.
    // 2) The tab is being detached from a tab bar which was borrowing
    //    the tab temporarily. Its previously selected tab is restored.
    if (item.panel.tabBar === sender) {
      sender.currentIndex = -1;
      sender.takeAt(args.index, false);
    } else {
      sender.takeAt(args.index, false);
      sender.currentTab = dragData.tempTab;
    }

    // Clear the temp panel and tab
    dragData.tempPanel = null;
    dragData.tempTab = null;

    // Setup the initial style and position for the floating tab.
    var style = tab.node.style;
    style.left = args.clientX - args.offsetX + 'px';
    style.top = args.clientY - args.offsetY + 'px';
    style.width = args.tabWidth + 'px';
    style.zIndex = '';

    // Add the floating tab to the document body.
    floatTab(tab, true);
    document.body.appendChild(tab.node);

    // Attach the necessary mouse event listeners.
    document.addEventListener('mouseup', <any>this, true);
    document.addEventListener('mousemove', <any>this, true);
    document.addEventListener('contextmenu', <any>this, true);
  }

  /**
   * Handle the `widgetRemoved` signal from a stack widget.
   */
  private _sw_widgetRemoved(sender: StackPanel, args: IStackIndexArgs): void {
    if (this._ignoreRemoved) {
      return;
    }
    var item = remove(this._items, it => it.widget === args.panel);
    if (!item) {
      return;
    }
    this._abortDrag();
    item.panel.tabBar.removeTab(item.widget.tab);
    if (item.panel.stackPanel.count === 0) {
      this._removePanel(item.panel);
    }
  }

  private _handleSize = 3;
  private _tabWidth = 175;
  private _tabOverlap = 1;
  private _minTabWidth = 45;
  private _ignoreRemoved = false;
  private _root: DockSplitter = null;
  private _dragData: IDragData = null;
  private _items: IDockItem[] = [];
}


/**
 * An object which holds item data for a dock widget.
 */
interface IDockItem {
  widget: ITabbable;
  panel: DockPanel;
}


/**
 * An object which holds drag data for a dock area.
 */
interface IDragData {
  item: IDockItem;
  index: number;
  tabWidth: number;
  offsetX: number;
  offsetY: number;
  grab: IDisposable;
  prevTab: ITab;
  lastHitPanel: DockPanel;
  tempPanel: DockPanel;
  tempTab: ITab;
}


/**
 * Set or remove the floating class on the given tab.
 */
function floatTab(tab: ITab, on: boolean): void {
  if (on) {
    tab.node.classList.add(FLOATING_CLASS);
  } else {
    tab.node.classList.remove(FLOATING_CLASS);
  }
}


/**
 * Iterate over the DockPanels starting with the given root splitter.
 *
 * Iteration stops when the callback returns anything but undefined.
 */
function iterPanels<T>(root: DockSplitter, cb: (panel: DockPanel) => T): T {
  for (var i = 0, n = root.count; i < n; ++i) {
    var result: T;
    var panel = root.panelAt(i);
    if (panel instanceof DockPanel) {
      result = cb(panel);
    } else {
      result = iterPanels(<DockSplitter>panel, cb);
    }
    if (result !== void 0) {
      return result;
    }
  }
  return void 0;
}


/**
 * Iterate over the DockSplitters starting with the given root splitter.
 *
 * Iteration stops when the callback returns anything but undefined.
 */
function iterSplitters<T>(root: DockSplitter, cb: (panel: DockSplitter) => T): T {
  var result = cb(root);
  if (result !== void 0) {
    return result;
  }
  for (var i = 0, n = root.count; i < n; ++i) {
    var panel = root.panelAt(i);
    if (panel instanceof DockSplitter) {
      result = iterSplitters(panel, cb);
      if (result !== void 0) {
        return result;
      }
    }
  }
  return void 0;
}


function find<T>(items: T[], cb: (v: T) => boolean): T {
  for (var i = 0, n = items.length; i < n; ++i) {
    var v = items[i];
    if (cb(v)) return v;
  }
  return void 0;
}


function remove<T>(items: T[], cb: (v: T) => boolean): T {
  for (var i = 0, n = items.length; i < n; ++i) {
    var v = items[i];
    if (cb(v)) {
      items.splice(i, 1);
      return v;
    }
  }
  return void 0;
}


/**
 * The class name added to DockPanel instances.
 */
var DOCK_PANEL_CLASS = 'p-DockPanel';

/**
 * The class name added to the DockPanel overlay div.
 */
var OVERLAY_CLASS = 'p-DockPanel-overlay';


/**
 * The split modes used to indicate a dock panel split direction.
 */
enum SplitMode {
  Top,
  Left,
  Right,
  Bottom,
  Invalid,
}


/**
 * An panel used by a DockArea.
 *
 * A dock panel acts as a simple container for a tab bar and stack
 * panel, plus a bit of logic to manage a drop indicator overlay.
 * The dock area manages the tab bar and stack panel directly, as
 * there is not always a 1:1 association between a tab and panel.
 *
 * This class is not part of the public Phosphor API.
 */
class DockPanel extends Panel {
  /**
   * Construct a new dock panel.
   */
  constructor() {
    super();
    this.node.classList.add(DOCK_PANEL_CLASS);
    this._tabBar = new TabBar();
    this._stackPanel = new StackPanel();
    this._overlayNode = this.createOverlay();

    var layout = new BoxLayout(Direction.TopToBottom, 0);
    layout.addPanel(this._tabBar);
    layout.addPanel(this._stackPanel);

    this.layout = layout;
    this.setFlag(PanelFlag.DisallowLayoutChange);
    this.node.appendChild(this._overlayNode);
  }

  /**
   * Get the tab bar child of the dock panel.
   */
  get tabBar(): TabBar {
    return this._tabBar;
  }

  /**
   * Get the stack panel child of the dock panel.
   */
  get stackPanel(): StackPanel {
    return this._stackPanel;
  }

  /**
   * Dispose of the resources held by the panel.
   */
  dispose(): void {
    this._clearOverlayTimer();
    this._tabBar = null;
    this._stackPanel = null;
    this._overlayNode = null;
    super.dispose();
  }

  /**
   * Compute the split mode for the given client position.
   */
  splitModeAt(clientX: number, clientY: number): SplitMode {
    var rect = this.node.getBoundingClientRect();
    var fracX = (clientX - rect.left) / rect.width;
    var fracY = (clientY - rect.top) / rect.height;
    if (fracX < 0.0 || fracX > 1.0 || fracY < 0.0 || fracY > 1.0) {
      return SplitMode.Invalid;
    }
    var mode: SplitMode;
    var normX = fracX > 0.5 ? 1 - fracX : fracX;
    var normY = fracY > 0.5 ? 1 - fracY : fracY;
    if (normX < normY) {
      mode = fracX <= 0.5 ? SplitMode.Left : SplitMode.Right;
    } else {
      mode = fracY <= 0.5 ? SplitMode.Top : SplitMode.Bottom;
    }
    return mode;
  }

  /**
   * Show the dock overlay for the given client position.
   *
   * If the overlay is already visible, it will be adjusted.
   */
  showOverlay(clientX: number, clientY: number): void {
    this._clearOverlayTimer();
    var box = this.boxData;
    var top = box.paddingTop;
    var left = box.paddingLeft;
    var right = box.paddingRight;
    var bottom = box.paddingBottom;
    switch (this.splitModeAt(clientX, clientY)) {
      case SplitMode.Left:
        right = this.width / 2;
        break;
      case SplitMode.Right:
        left = this.width / 2;
        break;
      case SplitMode.Top:
        bottom = this.height / 2;
        break;
      case SplitMode.Bottom:
        top = this.height / 2;
        break;
      default:
        return;
    }
    // The first time the overlay is made visible, it is positioned at
    // the cursor with zero size before being displayed. This allows
    // for a nice transition to the normally computed size. Since the
    // elements starts with display: none, a restyle must be forced.
    var style = this._overlayNode.style;
    if (this._overlayHidden) {
      this._overlayHidden = false;
      var rect = this.node.getBoundingClientRect();
      style.top = clientY - rect.top + 'px';
      style.left = clientX - rect.left + 'px';
      style.right = rect.right - clientX + 'px';
      style.bottom = rect.bottom - clientY + 'px';
      style.display = '';
      this._overlayNode.offsetWidth; // force restyle
    }
    style.opacity = '1';
    style.top = top + 'px';
    style.left = left + 'px';
    style.right = right + 'px';
    style.bottom = bottom + 'px';
  }

  /**
   * Hide the dock overlay.
   *
   * If the overlay is already hidden, this is a no-op.
   */
  hideOverlay(): void {
    if (this._overlayHidden) {
      return;
    }
    this._clearOverlayTimer();
    this._overlayHidden = true;
    this._overlayNode.style.opacity = '0';
    this._overlayTimer = setTimeout(() => {
      this._overlayTimer = 0;
      this._overlayNode.style.display = 'none';
    }, 150);
  }

  /**
   * Create the overlay node for the dock panel.
   */
  protected createOverlay(): HTMLElement {
    var overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.style.display = 'none';
    return overlay;
  }

  /**
   * Clear the overlay timer.
   */
  private _clearOverlayTimer(): void {
    if (this._overlayTimer) {
      clearTimeout(this._overlayTimer);
      this._overlayTimer = 0;
    }
  }

  private _tabBar: TabBar;
  private _overlayTimer = 0;
  private _overlayHidden = true;
  private _stackPanel: StackPanel;
  private _overlayNode: HTMLElement = null;
}


/**
 * The class name added to DockSplitter instances.
 */
var DOCK_SPLITTER_CLASS = 'p-DockSplitter';


/**
 * A split panel used by a DockArea.
 *
 * This class is not part of the public Phosphor API.
 */
class DockSplitter extends SplitPanel {
  /**
   * Construct a new dock splitter.
   */
  constructor(orientation: Orientation) {
    super(orientation);
    this.node.classList.add(DOCK_SPLITTER_CLASS);
  }
}

} // module phosphor.panels
