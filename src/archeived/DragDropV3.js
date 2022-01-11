// import throttle from 'lodash/throttle'
// import debounce from 'lodash/debounce'
import { EventEmitter } from 'eventemitter3'
import './index.css'

import {
    CONTAINER_CLASS,
    PLACEHOLDER_CLASS,
    DRAGGABLE_CLASS,
    DRAG_HANDLER_CLASS
} from './const'

class IntersectState {
    direction = NaN
    value = NaN
    dPositive = NaN
    dNegative = NaN
    threshold = 0
    root
    target

    constructor ({ root, target, orientation = '', threshold = 0 }) {
        this.root = root
        this.target = target
        this.threshold = threshold
        this.orientation = orientation.toUpperCase()
        if (!this.root || !this.target) return

        const dPositive = this.size(
            root.right - target.right,
            root.bottom - target.bottom
        )
        const dNegative = this.size(
            root.left - target.left,
            root.top - target.top
        )
        let direction = NaN
        let value = NaN
        if (dPositive <= threshold && dNegative >= -threshold) {
            direction = 2
        }
        else if (dPositive > threshold && dNegative < -threshold) {
            direction = 0
        }
        else if (dPositive > threshold && dNegative >= -threshold) {
            direction = -1
            value = dNegative
        }
        else if (dPositive <= threshold && dNegative < -threshold) {
            direction = 1
            value = dPositive
        }
        this.dPositive = dPositive
        this.dNegative = dNegative
        this.direction = direction
        this.value = value
    }

    size (x, y) {
        return this.orientation === 'X' ? x : y
    }

    // include value = 0
    get isIntersecting () {
        return this.direction === 1 || this.direction === -1
    }
}

class ScrollState {
    scrollOffset = NaN
    scrollSize = NaN
    clientSize = NaN
    el
    rect
    index = NaN

    constructor ({ el, index, rect, orientation = '' }) {
        this.orientation = orientation.toUpperCase()
        this.index = index == null ? NaN : index
        this.el = el
        if (!this.el) return

        this.rect = rect
        if (!rect) {
            this.rect = el.getBoundingClientRect()
        }
        let scrollOffset, clientSize, scrollSize
        if (elementIsWindow(el)) {
            if (this.orientation === 'X') {
                scrollOffset = window.scrollX
                clientSize = window.innerWidth
                scrollSize = document.documentElement.scrollWidth
            }
            else {
                scrollOffset = window.scrollY
                clientSize = window.innerHeight
                scrollSize = document.documentElement.scrollHeight
            }
        }
        else {
            if (this.orientation === 'X') {
                scrollOffset = el.scrollLeft
                clientSize = el.clientWidth
                scrollSize = el.scrollWidth
            }
            else {
                scrollOffset = el.scrollTop
                clientSize = el.clientHeight
                scrollSize = el.scrollHeight
            }
        }
        this.scrollSize = scrollSize
        this.scrollOffset = scrollOffset
        this.clientSize = clientSize
    }

    isToEnd (direction) {
        if ([this.scrollOffset, this.clientSize, this.scrollSize].some(isNaN)) return true
        let isEnd = true
        if (direction === 1) {
            isEnd = this.scrollOffset + this.clientSize >= this.scrollSize
        }
        if (direction === -1) {
            isEnd = this.scrollOffset === 0
        }
        return isEnd
    }
}

// Fixme 当前状态的滚动+scrollDelta后，可能超过应该滚动的距离
class ParentState {
    itemIntersectState = new IntersectState({})
    containerIntersectState = new IntersectState({})
    scrollState = new ScrollState({})

    constructor ({ itemIntersectState, containerIntersectState, scrollState }) {
        if (itemIntersectState) {
            this.itemIntersectState = itemIntersectState
        }
        if (containerIntersectState) {
            this.containerIntersectState = containerIntersectState
        }
        if (scrollState) {
            this.scrollState = scrollState
        }
    }

    get isNearEdge () { // 物品是否接近边界
        return this.itemIntersectState.isIntersecting
    }

    get isScrollable () { // 是否有parent可滚动(指定方向)
        return !this.scrollState.isToEnd(this.itemIntersectState.direction)
    }

    get isFullVisible () { // Container在滚动方向是否已经完全可见

        const itemDirection = this.itemIntersectState.direction
        const { dPositive, dNegative, threshold } = this.containerIntersectState
        if (itemDirection === 1) {
            return dPositive >= threshold
        }
        if (itemDirection === -1) {
            return dNegative <= -threshold
        }
        return (dNegative <= threshold && dPositive >= -threshold)
    }

    get hasItemMoveSpace () {
        const rect = this.containerIntersectState.target
        const { isIntersecting, direction, orientation, target: itemRect } = this.itemIntersectState
        if (!rect || !isIntersecting) return false
        let v
        if (orientation === 'X') {
            v = direction === 1 ? window.innerWidth - rect.right : rect.left
            // console.log('compute move space', v, v >= itemRect.width)
            return v >= itemRect.width
        }
        else {
            v = direction === 1 ? window.innerHeight - rect.bottom : rect.top
            // console.log('compute move space', v, v >= itemRect.height)
            return v >= itemRect.height
        }
    }

    get shouldScroll () {
        return this.isNearEdge && this.isScrollable && !(this.isFullVisible && this.hasItemMoveSpace)
    }
}

// Fixme 是否有更好的设计模式？
// Fixme 能否停止时有缓冲，而不是硬着陆？
class Scroller extends EventEmitter {
    currentParentState = new ParentState({})
    scrollPeriods = []
    scrollDeltaFunction

    static defaultScrollDeltaFunction ({ state }) {
        const alpha = 3
        const { value, direction } = state.itemIntersectState
        const edge = value * direction
        const [a1, b1, a2, b2] = [-20, 1, -100, 10]
        const k = (b1 - b2) / (a1 - a2)
        const b = b1 - k * a1
        let beta
        if (edge > a1) {
            beta = b1
        }
        else if (edge < a2) {
            beta = b2
        }
        else {
            beta = k * edge + b
        }
        // console.log('calculate', edge, alpha, beta, direction)
        return alpha * beta * direction
    }

    constructor ({ scrollSpeed }) {
        super()
        this.scrollDeltaFunction = this.getScrollDeltaFunction(scrollSpeed)

    }

    // TODO 优化参数配置
    getScrollDeltaFunction (prop) {
        if (prop instanceof Function) return prop
        return Scroller.defaultScrollDeltaFunction
    }

    updateParentState (newState) {
        const oldState = this.currentParentState
        this.currentParentState = newState
        const newIsNearEdge = newState.isNearEdge
        const oldIsNearEdge = oldState.isNearEdge
        const oldShouldScroll = oldState.shouldScroll
        const newShouldScroll = newState.shouldScroll
        // console.log('updateState', newState)

        if (!oldIsNearEdge && newIsNearEdge) {
            this.emit('enterViewportEdge', newState)
        }
        if (oldIsNearEdge && !newIsNearEdge) {
            this.emit('leaveViewportEdge', newState)
        }

        // TODO 需要更多滚动状态指示事件
        if (!oldShouldScroll && newShouldScroll) {
            // console.log('startScroll', newState)
            this.startScroll(newState)
        }
        else if (oldShouldScroll && !newShouldScroll) {
            // console.log('stop this scroll')
            this.stopScroll(oldState)
        }
        else if (oldShouldScroll && newShouldScroll) {
            if (this.isSamePeriod(newState, oldState)) {
                // do nothing
            }
            else {
                // console.log('stop & startScroll', newState)
                this.stopScroll(oldState)
                this.startScroll(newState)
            }
        }
        else {
            // no scroll
        }
    }

    isSamePeriod (s1, s2) {
        return !!s1.scrollState.el && !!s2.scrollState.el &&
            s1.scrollState.el === s2.scrollState.el &&
            s1.scrollState.direction === s2.scrollState.direction
    }

    stopScroll (state) {
        const period = this.scrollPeriods.find(p => this.isSamePeriod(p.state, state))
        // if (period) {
        //     console.log('stopScroll', period, state)
        // }
        // else {
        //     console.log('stopScroll error', state)
        // }

        if (period) {
            period.stopFlag = true
            this.emit('programmingScrollEnd', {
                startTime: period.startTime,
                endTime: Date.now(),
                endState: state, // Fixme 有可能是个全空的，此时要用上次的state
                startState: period.state
            })
            this.scrollPeriods = this.scrollPeriods.filter(p => p !== period)
        }
    }

    startScroll (startState) {
        if (!startState.shouldScroll) return
        if (this.scrollPeriods.some(p => this.isSamePeriod(p.state, startState))) return

        const startTime = Date.now()
        const period = {
            startTime,
            stopFlag: false,
            state: startState
        }
        this.scrollPeriods.push(period)
        this.emit('programmingScrollStart', {
            startTime,
            state: startState
        })
        const scroll = () => {
            const state = this.currentParentState
            if (period.stopFlag) return false
            const el = state.scrollState.el
            const scrollDelta = this.scrollDeltaFunction({
                startTime,
                startState,
                state
            })
            // console.log('scroll', scrollDelta, state)
            if (isNaN(scrollDelta) || typeof scrollDelta !== 'number') {
                // console.log('scrollError', this.periods.find(p => p === period))
                // Fixme 容错机制，停止机制
                this.emit('programmingScrollError', {
                    startTime,
                    state,
                    scrollDelta
                })
                this.stopScroll(state)
                return false
            }
            const target = elementIsWindow(el) ? window : el
            const { orientation, scrollSize, scrollOffset } = state.scrollState
            const newScrollOffset = Math.min(scrollOffset + scrollDelta, scrollSize)
            // console.log('scroll', newScrollOffset)
            if (orientation === 'X') {
                target.scrollTo({ left: newScrollOffset })
            }
            else {
                target.scrollTo({ top: newScrollOffset })
            }
            this.emit('programmingScroll', {
                startTime,
                state
            })
            return true
        }

        const handler = () => {
            const next = scroll()
            if (next) {
                window.requestAnimationFrame(handler)
            }
        }
        window.requestAnimationFrame(handler)
    }

    clearScrollPeriods () {
        // console.log('clear', this.periods)
        this.scrollPeriods.forEach(p => {
            p.stopFlag = true
            this.emit('programmingScrollEnd', {
                startTime: p.startTime,
                endTime: Date.now(),
                endState: new ParentState({}),
                startState: p.state
            })
        })
        this.scrollPeriods = []
        this.currentParentState = new ParentState({})
    }
}

// TODO 深入考虑滚动的判断依据
function isElementScrollable (el, orientation) {
    // const scrollSize = this.size(el.scrollWidth, el.scrollHeight)
    const isRoot = el === document.documentElement
    // const clientSize = isRoot
    //     ? this.size(window.innerWidth, window.innerHeight)
    //     : this.size(el.clientWidth, el.clientHeight)

    const style = window.getComputedStyle(el)
    const overflow = style['overflow' + orientation.toUpperCase()]

    const scrollable = overflow === 'scroll' || overflow === 'auto' || (isRoot && overflow !== 'hidden')

    return {
        // isScrollable: scrollSize > clientSize && scrollable,
        isScrollable: scrollable,
        style
    }
}

function elementIsWindow (el) {
    return el === document.documentElement || el === window
}

function getScrollableParents (el, orientation) {
    let list = []

    while (el.parentElement) {
        el = el.parentElement
        const { isScrollable, style } = isElementScrollable(el, orientation)

        if (isScrollable) {
            list.push(el)
        }
        if (style.position === 'fixed') {
            break
        }
    }
    return list
}

function translateRect (r, dX, dY) {
    // console.log('translateRect', r, dX, dY)
    return DOMRectReadOnly.fromRect({
        // top: r.top + dY,
        // left: r.left + dX,
        // bottom: r.bottom + dY,
        // right: r.right + dX,
        x: r.left + dX,
        y: r.top + dY,
        width: r.width,
        height: r.height
    })
}

// Fixme state的整数化？小数会影响运算
// Fixme program scroll在到顶时小范围震动，大概率是小数取整导致的
// Fixme 可能存在listener泄露的问题（有listener未正确remove）
export class DragDrop extends Scroller {
    static INACTIVE = 0
    static DRAG_START_ACTIVE = 1
    static DRAGGING = 2
    static DROP_ACTIVE = 3
    static CANCEL_REASON = {
        EXCEED_OFFSET_LIMIT: 1,
        END_BEFORE_DELAY: 2,
        NOT_DRAGGABLE_ELEMENT: 3
    }

    // root
    container

    // props
    vertical
    // Fixme 随距离变化
    transitionDuration
    // TODO 支持传入HTMLElements
    placeholder
    scrollThreshold
    lockCrossAxis
    lockArea
    // TODO 改变光标，有progress-circle
    startDelay
    touchStartDelay
    startOffsetTolerate
    // class前缀
    name
    // [name]-drag-inactive
    // [name]-start-active
    // [name]-drag-active
    // [name]-drop-active
    inactiveClass
    startActiveClass
    dragActiveClass
    dropActiveClass

    // state (clear after each drag action)
    _status = DragDrop.INACTIVE

    _children = []
    innerOrder = []
    orderedRects = []

    placeholderElement
    scrollableParents = []
    scrollableParentRects = []

    _dropTimeout = null
    _dragCancelFlag = false

    startIndex = NaN
    startOffsetX = NaN
    startOffsetY = NaN
    startClientX = NaN
    startClientY = NaN
    startContainerRect = NaN

    currentIndex = NaN
    currentOffsetX = NaN
    currentOffsetY = NaN
    currentClientX = NaN
    currentClientY = NaN
    currentContainerRect

    endClientX = NaN
    endClientY = NaN
    endOffsetY = NaN
    endOffsetX = NaN
    endIndex = NaN
    endContainerRect

    containerIntersectState = new IntersectState({})

    static defaultPlaceholder () {
        return document.createElement('div')
    }

    constructor ({
        container,
        // viewport,
        vertical = false,
        transitionDuration = 200,
        placeholder = DragDrop.defaultPlaceholder,
        scrollSpeed,
        scrollThreshold = 0,
        lockCrossAxis = false,
        lockArea = false,
        startDelay = 0,
        touchStartDelay = 0,
        startOffsetTolerate = 5,
        name = '',
        inactiveClass = '',
        startActiveClass = '',
        dragActiveClass = '',
        dropActiveClass = ''
    }) {
        super({ scrollSpeed })
        if (!(container instanceof HTMLElement)) {
            throw TypeError('Container need to be HTMLElement')
        }
        this.container = container

        // set props
        this.vertical = vertical
        this.transitionDuration = transitionDuration
        this.placeholder = placeholder
        this.scrollThreshold = scrollThreshold
        // this.viewport = viewport
        this.lockCrossAxis = lockCrossAxis
        this.lockArea = lockArea
        this.startDelay = startDelay
        this.touchStartDelay = touchStartDelay
        this.startOffsetTolerate = startOffsetTolerate
        // class system
        this.name = name
        this.inactiveClass = inactiveClass
        this.startActiveClass = startActiveClass
        this.dragActiveClass = dragActiveClass
        this.dropActiveClass = dropActiveClass

        // register inner listeners

        // drag lifecycle
        // this.on('pressStart', this.onPressStart)
        // this.on('dragCanceled', this.onDragCanceled)
        // this.on('beforeDragStart', this.onBeforeDragStart)
        // this.on('dragStart', this.onDragStart)
        // this.on('dragOver', this.onDragOver)
        // this.on('beforeDrop', this.onBeforeDrop)
        // this.on('drop', this.onDrop)
        // this.on('dragEnd', this.onDragEnd)

        // layout
        // this.on('dragCross', this.onDragCross)
        // this.on('targetMove', this.onTargetMove)
        // this.on('orderChange', this.onOrderChange)
        // this.on('containerMove', this.onContainerMove)
        // this.on('containerResize', this.onContainerResize)
        this.on('enterViewportEdge', this.onEnterViewportEdge)

        this.bindMouseDragStartListeners()
        this.bindTouchDragStartListeners()
        // bind class
        this.container.classList.add(CONTAINER_CLASS);
        [...this.container.children]
            .filter(this.isElementDraggable)
            .forEach(el => {
                el.classList.add(...this.dragInactiveClassList)
            })
    }

    _mergeClassList (suffix, customList) {
        const defaultClass = `${this.name || 'l'}-${suffix}`
        customList = Array.isArray(customList) ? customList : customList.split(' ').filter(v => !!v)
        return [defaultClass, ...customList]
    }

    get dragInactiveClassList () {
        return this._mergeClassList('inactive', this.inactiveClass)
    }

    get startActiveClassList () {
        return this._mergeClassList('start-active', this.startActiveClass)
    }

    get dragActiveClassList () {
        return this._mergeClassList('drag-active', this.dragActiveClass)
    }

    get dropActiveClassList () {
        return this._mergeClassList('drop-active', this.dropActiveClass)
    }

    isElementDraggable (el) {
        return el.classList.contains(DRAGGABLE_CLASS)
    }

    // functional
    displacement (x1, y1, x2, y2) {
        return this.size(x1, y1) - this.size(x2, y2)
    }

    crossDisplacement (x1, y1, x2, y2) {
        return this.crossAxisSize(x1, y1) - this.crossAxisSize(x2, y2)
    }

    crossAxisDisplacement (x1, y1, x2, y2) {
        return this.crossAxisSize(x1, y1) - this.crossAxisSize(x2, y2)
    }

    size (x, y) {
        return this.vertical ? y : x
    }

    crossAxisSize (x, y) {
        return this.vertical ? x : y
    }

    inRect (x, y, rect) {
        const point = this.size(x, y)
        const start = this.size(rect.left, rect.top)
        const end = this.size(rect.right, rect.bottom)
        // console.log('inRect', point >= start && start <= end, point, start, end)
        return point >= start && point <= end
    }

    // getters
    get orientation () {
        return this.vertical ? 'Y' : 'X'
    }

    get crossOrientation () {
        return this.vertical ? 'X' : 'Y'
    }

    get children () {
        return this._children
    }

    get isDragInactive () {
        return this._status === DragDrop.INACTIVE
    }

    get isDragStartActive () {
        return this._status === DragDrop.DRAG_START_ACTIVE
    }

    get isDragging () {
        return this._status === DragDrop.DRAGGING
    }

    get isDropActive () {
        return this._status === DragDrop.DROP_ACTIVE
    }

    get isDragStarted () {
        return this._status >= DragDrop.DRAGGING
    }

    get startElement () {
        return this.children[this.startIndex]
    }

    get startRect () {
        return this.orderedRects[this.startIndex]
    }

    get currentItemRect () {
        const s = this.startRect
        if (!s) return
        return translateRect(s, this.currentClientX - this.startClientX, this.currentClientY - this.startClientY)
    }

    // dom action
    blurActiveElement () {
        if (
            document.activeElement &&
            document.activeElement.tagName.toLowerCase() !== 'body'
        ) {
            document.activeElement.blur()
        }
    }

    updateScrollableParents () {
        this.scrollableParents = getScrollableParents(this.container, this.orientation)
    }

    updateScrollableParentRects () {
        this.scrollableParentRects = this.scrollableParents.map(el => {
            if (elementIsWindow(el)) {
                return DOMRectReadOnly.fromRect({
                    x: 0,
                    y: 0,
                    width: window.innerWidth,
                    height: window.innerHeight
                })
            }
            else {
                return el.getBoundingClientRect()
            }
        })
    }

    // register dom listener
    // TODO 代码整理优化
    // Fixme 考虑如何禁止某些element的拖拽
    bindMouseDragStartListeners () {
        this.container.addEventListener('mousedown', e => {
            if (+e.button !== 0) return
            // console.log('mousedown event', this._status, this.isDragStarted, this.isDragStartActive)
            if (this.isDragStarted || this.isDragStartActive) return
            const payload = {
                clientX: e.clientX,
                clientY: e.clientY,
                event: e
            }
            if (this.startDelay) {
                this.delayMouseDragStart(payload)
            }
            else {
                e.preventDefault()
                e.stopPropagation()

                this.blurActiveElement()
                this.bindMouseLifecycleListeners()
                this.pressStart(payload)
                this.beforeDragStart(payload)
                this.dragStart(payload)
            }
        })
    }

    bindEnvironmentListeners () {
        // scroll
        const scroll = e => {
            window.requestAnimationFrame(() => {
                if (!this.isDragStarted) return
                this.moveContainer(e)
            })
        }

        const scrollTargets = this.scrollableParents.map(el => {
            return el === document.documentElement ? window : el
        })

        // resize
        const resize = e => {
            window.requestAnimationFrame(() => {
                if (!this.isDragStarted) return
                this.resizeContainer(e)
            })
        }
        scrollTargets.forEach(t => {
            t.addEventListener('scroll', scroll, { passive: true })
        })
        window.addEventListener('resize', resize, { passive: true })
        this.once('dragEnd', () => {
            window.removeEventListener('resize', resize)
            scrollTargets.forEach(t => {
                t.removeEventListener('scroll', scroll)
            })
        })
    }

    delayMouseDragStart ({ clientX, clientY, event }) {
        let endX = clientX
        let endY = clientY
        let pid
        let startRect = this.container.getBoundingClientRect()
        let endRect = startRect
        const tolerate = this.startOffsetTolerate
        const scrollableParents = getScrollableParents(this.container, this.orientation)
        const events = [
            { target: window, type: 'mousemove' },
            { target: window, type: 'resize' },
            ...scrollableParents.map(s => ({ target: s, type: 'scroll' }))
        ]
        const onMove = e => {
            window.requestAnimationFrame(() => {
                if (e instanceof MouseEvent) {
                    endX = e.clientX
                    endY = e.clientY
                }
                else {
                    endRect = this.container.getBoundingClientRect()
                }
                const dX = endX - clientX + startRect.left - endRect.left
                const dY = endY - clientY + startRect.top - endRect.top
                if (
                    Math.abs(dX) > tolerate || Math.abs(dY) > tolerate
                ) {
                    window.removeEventListener('mouseup', mouseup)
                    events.forEach(({ target, type }) => {
                        target.removeEventListener(type, onMove)
                    })
                    clearTimeout(pid)
                    this.dragCanceled({
                        clientX, clientY, event,
                        type: DragDrop.CANCEL_REASON.EXCEED_OFFSET_LIMIT
                    })
                    // console.log('move exceed limit')
                }
            })
        }
        const mouseup = () => {
            events.forEach(({ target, type }) => {
                target.removeEventListener(type, onMove)
            })
            clearTimeout(pid)
            this.dragCanceled({
                clientX, clientY, event,
                type: DragDrop.CANCEL_REASON.END_BEFORE_DELAY
            })
            // console.log('mouseup before delay')
        }

        pid = setTimeout(() => {
            window.removeEventListener('mouseup', mouseup)
            events.forEach(({ target, type }) => {
                target.removeEventListener(type, onMove)
            })
            this.blurActiveElement()
            this.bindMouseLifecycleListeners()
            this.beforeDragStart({ clientX: endX, clientY: endY, event })
            this.dragStart({ clientX: endX, clientY: endY, event })
        }, this.startDelay)

        // console.log('start count')
        this.pressStart({ clientX, clientY, event })
        events.forEach(({ target, type }) => {
            target.addEventListener(type, onMove, { passive: true })
        })
        window.addEventListener('mouseup', mouseup, { once: true })
    }

    bindMouseLifecycleListeners () {
        // dragover
        const dragOver = e => {
            // trigger by touch
            if (!e.movementX && !e.movementY) return
            window.requestAnimationFrame(() => {
                if (!this.isDragging) return
                this.moveTarget(e)
            })
        }
        window.addEventListener('mousemove', dragOver, { passive: true })

        // drop
        window.addEventListener('mouseup', e => {
            e.preventDefault()
            e.stopPropagation()
            window.removeEventListener('mousemove', dragOver)
            this.beforeDrop({ clientX: e.clientX, clientY: e.clientY })
            this.drop({ clientX: e.clientX, clientY: e.clientY })
        }, { once: true })
    }

    bindTouchDragStartListeners () {
        this.container.addEventListener('touchstart', e => {
            // console.log('touchstart event', e, index)
            if (this.isDragStarted || this.isDragStartActive) return
            const rect = this.container.getBoundingClientRect()
            const touch = [...e.touches].find(t => {
                const { clientX: x, clientY: y } = t
                return x >= rect.left && x <= rect.right &&
                    y >= rect.top && y <= rect.bottom
            })
            if (!touch) return

            const payload = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                event: e,
                touchId: touch.identifier
            }
            if (this.startDelay || this.touchStartDelay) {
                this.delayTouchDragStart(payload)
            }
            else {
                if (e.cancelable) e.preventDefault()
                e.stopPropagation()
                this.blurActiveElement()
                this.bindTouchLifecycleListeners(touch.identifier)
                this.pressStart(payload)
                this.beforeDragStart(payload)
                this.dragStart(payload)
            }
        })
    }

    delayTouchDragStart ({ clientX, clientY, event, touchId }) {
        const delayMs = this.touchStartDelay || this.startDelay
        let endX = clientX
        let endY = clientY
        let pid
        let startRect = this.container.getBoundingClientRect()
        let endRect = startRect
        const tolerate = this.startOffsetTolerate
        const scrollableParents = getScrollableParents(this.container, this.orientation)
        const events = [
            { target: window, type: 'touchmove' },
            { target: window, type: 'resize' },
            ...scrollableParents.map(s => ({ target: s, type: 'scroll' }))
        ]

        const onMove = e => {
            window.requestAnimationFrame(() => {
                if (e instanceof TouchEvent) {
                    const touch = [...e.touches].find(t => t.identifier === touchId)
                    if (!touch) return
                    endX = touch.clientX
                    endY = touch.clientY
                }
                else {
                    endRect = this.container.getBoundingClientRect()
                }
                const dX = endX - clientX + startRect.left - endRect.left
                const dY = endY - clientY + startRect.top - endRect.top
                if (
                    Math.abs(dX) > tolerate || Math.abs(dY) > tolerate
                ) {
                    window.removeEventListener('touchend', touchend)
                    events.forEach(({ target, type }) => {
                        target.removeEventListener(type, onMove)
                    })
                    clearTimeout(pid)
                    this.dragCanceled({
                        clientX, clientY, event,
                        type: DragDrop.CANCEL_REASON.EXCEED_OFFSET_LIMIT
                    })
                    // console.log('move exceed limit')
                }
            })
        }
        const touchend = e => {
            if (e.cancelable) {
                e.preventDefault()
            }
            events.forEach(({ target, type }) => {
                target.removeEventListener(type, onMove)
            })
            clearTimeout(pid)
            this.dragCanceled({
                clientX, clientY, event,
                type: DragDrop.CANCEL_REASON.END_BEFORE_DELAY
            })
            // console.log('touched before delay')
        }

        pid = setTimeout(() => {
            window.removeEventListener('touchend', touchend)
            events.forEach(({ target, type }) => {
                target.removeEventListener(type, onMove)
            })
            this.blurActiveElement()
            this.bindTouchLifecycleListeners(touchId)
            this.beforeDragStart({ clientX: endX, clientY: endY, event })
            this.dragStart({ clientX: endX, clientY: endY, event })
        }, delayMs)
        // console.log('start count')
        this.pressStart({ clientX, clientY, event })
        events.forEach(({ target, type }) => {
            target.addEventListener(type, onMove, { passive: true })
        })
        window.addEventListener('touchend', touchend, { once: true })
    }

    bindTouchLifecycleListeners (touchId) {
        // dragover
        const dragOver = e => {
            if (!this.isDragging) return
            if (e.cancelable) {
                e.preventDefault()
            }
            const touch = [...e.touches].find(t => t.identifier === touchId)
            if (touch) {
                // console.log('touchmove', touch)
                // console.log('dragover', touch.clientX, touch.clientY)
                window.requestAnimationFrame(() => {
                    if (!this.isDragging) return
                    this.moveTarget({
                        clientX: touch.clientX,
                        clientY: touch.clientY
                    })
                })
            }
        }
        window.addEventListener('touchmove', dragOver, { passive: false })

        // drop
        const touchend = e => {
            if (e.cancelable) {
                e.preventDefault()
            }
            e.stopPropagation()
            window.removeEventListener('touchmove', dragOver)
            const touch = [...e.changedTouches].find(t => t.identifier === touchId)
            // console.log('touchend', e)
            if (touch) {
                this.beforeDrop({
                    clientX: touch.clientX,
                    clientY: touch.clientY
                })
                this.drop({
                    clientX: touch.clientX,
                    clientY: touch.clientY
                })
                window.removeEventListener('touchend', touchend)
            }
        }
        window.addEventListener('touchend', touchend)
    }

    updateStatus (status) {
        this._status = status
    }

    updateChildren () {
        this._children = [...this.container.children]
        this.innerOrder = this.children.map((c, i) => i)
    }

    updateInnerOrder () {
        let list = [...this.innerOrder]
        const children = this.children
        if (list.length !== children.length) {
            list = children.map((c, i) => i)
            this.innerOrder = list
        }
        else if (
            !isNaN(this.startIndex) &&
            !isNaN(this.currentIndex) &&
            this.startIndex !== this.currentIndex
        ) {
            const [from, to] = [this.startIndex, this.currentIndex]
            if (
                from >= 0 && from < list.length &&
                to >= 0 && to < list.length
            ) {
                // insertIndex是真正插入的地方
                let insertIndex = to
                let temp = list[from]
                list.splice(from, 1)
                list.splice(insertIndex, 0, temp)
            }
            this.innerOrder = list
        }
    }

    updateOrderedRects () {
        this.orderedRects = this.children
            // get boxes
            .map((el, index) => el.getBoundingClientRect())
            // ordered
            .map((box, i, rects) => rects[this.innerOrder[i]])
    }

    makePlaceholder () {
        const placeholder = this.placeholder()
        placeholder.classList.add(PLACEHOLDER_CLASS)

        const s = placeholder.style
        s.height = this.startRect.height + 'px'
        s.width = this.startRect.width + 'px'
        this.placeholderElement = placeholder
    }

    setDragOverStaticStyle () {
        this.children.forEach((el, i) => {
            const s = el.style
            // 与是否Draggable无关
            if (i === this.startIndex) {
                s.zIndex = 2
                s.position = 'fixed'
                const { top, left, height, width } = this.startRect
                s.top = top + 'px'
                s.left = left + 'px'
                s.height = height + 'px'
                s.width = width + 'px'
                s.transitionDuration = '0'
                s.transitionTimingFunction = ''
                s.transitionProperty = ''
                s.pointerEvents = 'none'
                s.transfrom = ''
            }
            if (i !== this.startIndex) {
                s.zIndex = 1
                // Fixme 设置important导致duration失效
                s.transitionDuration = `${this.transitionDuration}ms`
                s.transitionTimingFunction = 'ease'
                s.transitionProperty = 'all'
                s.pointerEvents = 'none'
            }
        })
        if (this.placeholderElement) {
            // TODO 可配置
            const ps = this.placeholderElement.style
            ps.transitionTimingFunction = 'ease'
            ps.zIndex = 0
            ps.transitionProperty = 'all'
            // const size = this.size(this.state.offsetWidth, this.state.offsetHeight)
            // TODO 动态计算移动持续时间
            ps.transitionDuration = `150ms`
        }
    }

    getCrossedBoxDisplacement () {
        const start = this.startIndex
        let to = isNaN(this.endIndex) ? this.currentIndex : this.endIndex
        if (isNaN(to)) return NaN

        return (start < to ? 1 : -1) * this.orderedRects
            .filter((box, i) => {
                return (i > start && i <= to) || (i < start && i >= to)
            })
            .reduce((t, box) => t + this.size(box.width, box.height), 0)
    }

    setDropStyle () {
        const el = this.children[this.startIndex]
        if (el) {
            const s = el.style
            s.transitionTimingFunction = 'ease'
            s.transitionProperty = 'all'
            // Fixme 动态配置
            s.transitionDuration = `${this.transitionDuration}ms`

            const boxDisplacement = this.getCrossedBoxDisplacement()
            const scRect = this.startContainerRect
            const ecRect = this.endContainerRect
            const containerDelta = this.displacement(
                ecRect.left,
                ecRect.top,
                scRect.left,
                scRect.top
            )
            const dragEndDisplacement = boxDisplacement + containerDelta
            // console.log('drop', boxDisplacement, containerDelta)
            // console.log('setDrop', `translate${this.orientation}(${dragEndDisplacement}px)`)
            let dX = 0, dY = 0
            this.vertical ? dY += dragEndDisplacement : dX += dragEndDisplacement
            s.left = this.startRect.left + dX + 'px'
            s.top = this.startRect.top + dY + 'px'
        }

    }

    setStartState (props) {
        const needProps = [
            'startClientX',
            'startClientY'
        ]
        needProps.forEach(key => {
            const v = props[key]
            if (typeof v === 'number' && !isNaN(v)) {
                this[key] = v
            }
            else {
                throw Error('[DragDrop] state error: ' + key + '=' + v)
            }
        })
        this.startContainerRect = this.container.getBoundingClientRect()
        this.startOffsetX = this.startClientX - this.startContainerRect.left
        this.startOffsetY = this.startClientY - this.startContainerRect.top

        // Fixme 二分查找优化
        this.startIndex = this.orderedRects.findIndex(rect => this.inRect(this.startClientX, this.startClientY, rect))
        if (this.startIndex == null || this.startIndex < 0) {
            throw Error(`[LegatoDnD] start position out of boundary: (${this.startClientX}, ${this.startClientY})`)
        }

        // this.currentClientX = this.startClientX
        // this.currentClientY = this.startClientY
        // this.currentOffsetX = this.startOffsetX
        // this.currentOffsetY = this.startOffsetY
        // this.currentIndex = this.startIndex
        // this.currentContainerRect = this.startContainerRect
    }

    updateCurrentIndex () {
        const d = this.displacement(
            this.currentOffsetX,
            this.currentOffsetY,
            this.startOffsetX,
            this.startOffsetY
        )

        const boxes = this.orderedRects
        const absD = Math.abs(d)
        let p = this.startIndex
        let sum = 0
        // TODO 使用二分查找
        /* eslint-disable */
        while ((d > 0 && p < boxes.length - 1) || (d < 0 && p > 0)) {
            const nextBox = boxes[d > 0 ? p + 1 : p - 1]
            const size = this.size(nextBox.width, nextBox.height)
            const threshold = size * 0.5
            if (sum + size < absD) {
                sum += size
                p += d > 0 ? 1 : -1
                continue
            }
            if (sum + threshold <= absD) {
                p += d > 0 ? 1 : -1
                break
            }
            break
        }
        // must valid (0 <= p <= length)
        this.currentIndex = p
    }

    // Fixme 超大物体，体验不好，移动端，设置为0体验不好，横向滚动，移动端，体验不好
    getParentState () {
        // 找最小的交叉边界，无论方向
        const pRectList = this.scrollableParentRects
        if (!pRectList.length) {
            return new ParentState({})
        }
        const currentItemRect = this.currentItemRect
        // console.log('currentItemRect', currentItemRect)
        const ccRect = this.currentContainerRect
        let iiState, pRect
        for (let i = 0; i < pRectList.length; ++i) {
            const s = new IntersectState({
                root: pRectList[i],
                target: currentItemRect,
                threshold: this.scrollThreshold,
                orientation: this.orientation
            })
            // console.log('compare', iiState, s)
            if (s.isIntersecting && (!iiState || Math.abs(s.value) > Math.abs(iiState.value))) {
                iiState = s
                pRect = pRectList[i]
            }
        }
        // console.log('getParentState', iiState)
        if (!iiState) {
            return new ParentState({})
        }
        const containerIntersectState = new IntersectState({
            root: pRect,
            target: ccRect,
            orientation: this.orientation
            // Fixme 这里threshold不能>0,否则嵌套parent造成无限滚动
            // threshold: 1.5 * this.size(currentItemRect.width, currentItemRect.height)
        })

        // 从里向外找scrollableParent
        let scrollState
        // for (let i = this.scrollableParents.length - 1; i >= 0; --i) {
        for (let i = 0; i < this.scrollableParents.length; ++i) {
            const s = new ScrollState({
                el: this.scrollableParents[i],
                index: i,
                rect: this.scrollableParentRects[i],
                orientation: this.orientation
            })
            if (!s.isToEnd(iiState.direction)) {
                scrollState = s
                break
            }
        }

        return new ParentState({
            itemIntersectState: iiState,
            containerIntersectState,
            scrollState
        })
    }

    updateOtherItemPosition () {
        this.children.forEach((el, i) => {
            let s = el.style
            const [start, to] = [this.startIndex, this.currentIndex]
            if (i === this.startIndex) return
            let value
            if ((i > start && i <= to) || (i >= to && i < start)) {
                const startBox = this.orderedRects[start]
                const startSize = this.size(startBox.width, startBox.height)
                value = start < to ? -startSize : startSize
            }
            else {
                value = 0
            }
            s.transform = `translate${this.orientation}(${value}px)`
        })
    }

    updateTargetPosition () {
        const el = this.children[this.startIndex]
        if (el) {
            // const params = [this.currentClientX, this.currentClientY, this.startClientX, this.startClientY]
            // let value = this.displacement(...params)
            // const crossValue = this.lockCrossAxis || this.restrictMove ? 0 : this.crossDisplacement(...params)
            // el.style.transform = `translate${this.orientation}(${value}px) translate${this.crossOrientation}(${crossValue}px)`
            let dX = this.currentClientX - this.startClientX
            let dY = this.currentClientY - this.startClientY
            if (this.lockArea || this.lockCrossAxis) {
                this.vertical ? dX = 0 : dY = 0
            }
            el.style.left = this.startRect.left + dX + 'px'
            el.style.top = this.startRect.top + dY + 'px'
            // console.log('updatePosition', this.startRect.top, dY, el.style.top)
        }
    }

    updatePlaceholderPosition () {
        const style = this.placeholderElement.style
        const boxDisplacement = this.getCrossedBoxDisplacement()
        style.transform = `translate${this.orientation}(${boxDisplacement}px)`
    }

    setCurrentState (props) {
        let isIndexChange = false
        const needProps = [
            'currentClientX',
            'currentClientY'
        ]
        needProps.forEach(key => {
            const v = props[key]
            if (typeof v === 'number' && !isNaN(v)) {
                this[key] = v
            }
            else {
                throw Error('[DragDrop] state error: ' + key + '=' + v)
            }
        })
        if (!(props.currentContainerRect instanceof DOMRectReadOnly)) {
            throw Error('[LegatoDnD] state error: currentContainerRect=' + props.currentContainerRect)
        }
        this.currentContainerRect = props.currentContainerRect
        this.currentOffsetX = this.currentClientX - this.currentContainerRect.left
        this.currentOffsetY = this.currentClientY - this.currentContainerRect.top
        const oldCurrentIndex = this.currentIndex
        this.updateCurrentIndex()
        if (this.currentIndex !== oldCurrentIndex) {
            isIndexChange = true
        }
        return { isIndexChange, oldCurrentIndex }
    }

    updateDraggingModel ({
        currentClientX = this.currentClientX,
        currentClientY = this.currentClientY,
        currentContainerRect = this.currentContainerRect
    }) {
        if (this.lockArea) {
            // console.log('calculate lockArea')
            const currentItemRect = translateRect(this.startRect, currentClientX - this.startClientX, currentClientY - this.startClientY)
            const state = new IntersectState({
                root: currentContainerRect,
                target: currentItemRect,
                orientation: this.orientation
            })
            if (state.value) {
                this.vertical ? currentClientY += state.value : currentClientX += state.value
            }
            const oldState = this.containerIntersectState
            if (!oldState.isIntersecting && state.isIntersecting) {
                this.emit('enterContainerEdge', { intersectState: state })
            }
            if (oldState.isIntersecting && !state.isIntersecting) {
                this.emit('leaveContainerEdge', { intersectState: state })
            }
            this.containerIntersectState = state
        }
        const { isIndexChange, oldCurrentIndex } = this.setCurrentState({
            currentClientX,
            currentClientY,
            currentContainerRect
        })
        // console.log('dragover', isStateChange, isIndexChange)

        if (isIndexChange) {
            this.updateOtherItemPosition()
            this.updatePlaceholderPosition()
            this.emit('dragCross', {
                start: this.startIndex,
                current: this.currentIndex,
                oldCurrent: oldCurrentIndex
            })
        }
    }

    setEndState (props) {
        const needProps = [
            'endClientX',
            'endClientY'
        ]
        // Fixme 重复代码整理
        needProps.forEach(key => {
            const v = props[key]
            if (typeof v === 'number' && !isNaN(v)) {
                this[key] = v
            }
            else {
                throw Error('[DragDrop] state error: ' + key + '=' + v)
            }
        })
        if (!(props.endContainerRect instanceof DOMRectReadOnly)) {
            throw Error('[LegatoDnD] state error: endContainerRect=' + props.endContainerRect)
        }
        this.endContainerRect = props.endContainerRect
        this.endOffsetX = this.endClientX - this.endContainerRect.left
        this.endOffsetY = this.endClientY - this.endContainerRect.top
        this.endIndex = this.currentIndex
    }

    alignDropPosition () {
        if (!this.scrollableParents.length) return
        // console.log('alignDropPosition')
        const boxDisplacement = this.getCrossedBoxDisplacement()
        const scRect = this.startContainerRect
        const ecRect = this.endContainerRect
        const containerDelta = this.displacement(
            ecRect.left,
            ecRect.top,
            scRect.left,
            scRect.top
        )
        const dragEndDisplacement = boxDisplacement + containerDelta
        let dX = 0, dY = 0
        this.vertical ? dY += dragEndDisplacement : dX = dragEndDisplacement
        const eiRect = translateRect(this.startRect, dX, dY)

        let r = {}
        r.x = this.scrollableParentRects.reduce((t, a) => Math.max(t, a.left), -Infinity)
        r.right = this.scrollableParentRects.reduce((t, a) => Math.min(t, a.right), Infinity)
        r.y = this.scrollableParentRects.reduce((t, a) => Math.max(t, a.top), -Infinity)
        r.bottom = this.scrollableParentRects.reduce((t, a) => Math.min(t, a.bottom), Infinity)
        r.width = r.right - r.x
        r.height = r.bottom - r.y
        // console.log('minimumParentRect', r.x, r.right, r.y, r.bottom)

        const minimumParentRect = DOMRectReadOnly.fromRect(r)

        const iiState = new IntersectState({
            root: minimumParentRect,
            target: eiRect,
            orientation: this.orientation
        })
        // console.log('align', iiState)
        if (iiState.isIntersecting) {
            let scrollState
            for (let i = 0; i < this.scrollableParents.length; ++i) {
                const s = new ScrollState({
                    el: this.scrollableParents[i],
                    index: i,
                    rect: this.scrollableParentRects[i],
                    orientation: this.orientation
                })
                if (!s.isToEnd(iiState.direction)) {
                    scrollState = s
                    break
                }
            }
            if (scrollState) {
                const target = elementIsWindow(scrollState.el) ? window : scrollState.el
                // Fixme 可能滚动不到（offset + delta > scrollSize）
                const value = scrollState.scrollOffset - iiState.value
                // console.log('align', value, iiState)
                if (this.vertical) {
                    target.scrollTo({ top: value, behavior: 'smooth' })
                }
                else {
                    target.scrollTo({ left: value, behavior: 'smooth' })
                }
            }
        }
    }

    updateDropModel ({
        endClientX = this.endClientX,
        endClientY = this.endClientY,
        endContainerRect = this.endContainerRect
    }) {
        this.updateStatus(DragDrop.DROP_ACTIVE)
        this.setEndState({
            endClientX,
            endClientY,
            endContainerRect
        })
        // console.log('positive', this.startTop + this.offsetHeight + boxDistance, sRect.bottom)
        // console.log('negative', this.startTop + boxDistance, sRect.top)
        this.setDropStyle()
        clearTimeout(this._dropTimeout)
        this._dropTimeout = setTimeout(() => {
            this.dragEnd({
                from: this.startIndex,
                to: this.currentIndex
            })
        }, this.transitionDuration)
    }

    clearDragState () {
        this._children = []
        this.innerOrder = []
        this.orderedRects = []

        this.placeholderElement = undefined
        this.scrollableParents = []
        this.scrollableParentRects = []

        this._dropTimeout = null
        this._dragCancelFlag = false

        this.startIndex = NaN
        this.startOffsetX = NaN
        this.startOffsetY = NaN
        this.startClientX = NaN
        this.startClientY = NaN
        this.startContainerRect = NaN

        this.currentIndex = NaN
        this.currentOffsetX = NaN
        this.currentOffsetY = NaN
        this.currentClientX = NaN
        this.currentClientY = NaN
        this.currentContainerRect = undefined

        this.endClientX = NaN
        this.endClientY = NaN
        this.endOffsetY = NaN
        this.endOffsetX = NaN
        this.endIndex = NaN
        this.endContainerRect = undefined

        this.containerIntersectState = new IntersectState({})
    }

    clearDragStyle () {
        let styles = [
            'zIndex',
            'transitionDuration',
            'transitionTimingFunction',
            'transitionProperty',
            'pointerEvents',
            'position',
            'transform',
            'top',
            'left',
            'width',
            'height'
        ]

        styles.forEach(key => {
            this.children.forEach(el => {
                el.style[key] = ''
            })
        })
    }

    clearPlaceholder () {
        [...this.container.children]
            .filter(el => el.classList.contains(PLACEHOLDER_CLASS))
            .forEach(el => {
                this.container.removeChild(el)
            })
        this.placeholderElement = undefined
    }

    pressStart () {
        if (!this.isDragInactive) return
        this.updateStatus(DragDrop.DRAG_START_ACTIVE)
        this.updateChildren()
        this.children
            .filter(this.isElementDraggable)
            .forEach(el => {
                el.classList.remove(...this.dragInactiveClassList)
                el.classList.add(...this.startActiveClassList)
            })
    }

    dragCanceled () {
        if (!this.isDragStartActive) return
        this.updateStatus(DragDrop.INACTIVE)
        this._children = []
        this.innerOrder = []
        this.orderedRects = []
        this.scrollableParentRects = []
        this.scrollableParents = []
    }

    beforeDragStart ({ clientX, clientY }) {
        if (!this.isDragStartActive) return
        this.updateOrderedRects()
        this.updateScrollableParents()
        this.updateScrollableParentRects()

        // set state
        this.setStartState({
            startClientX: clientX,
            startClientY: clientY
        })
        if (!this.isElementDraggable(this.startElement)) {
            this._dragCancelFlag = true
        }
        this.emit('beforeDragStart', {
            index: this.startIndex,
            cancel: () => {
                this._dragCancelFlag = true
            }
        })
    }

    // Fixme error handler
    dragStart ({ clientX, clientY, event }) {
        if (!this.isDragStartActive) return
        if (this._dragCancelFlag) {
            this.dragCanceled({
                clientX, clientY, event,
                type: DragDrop.CANCEL_REASON.NOT_DRAGGABLE_ELEMENT
            })
        }
        this.updateStatus(DragDrop.DRAGGING)
        // this.updateOrderedRects()
        // this.updateScrollableParents()
        // this.updateScrollableParentRects()

        // set state
        // this.setStartState({
        //     startClientX,
        //     startClientY
        // })

        // this.container.focus()
        this.bindEnvironmentListeners()

        // make placeholder
        this.makePlaceholder()
        this.setDragOverStaticStyle()
        this.startElement.after(this.placeholderElement)

        this.updateDraggingModel({
            currentClientX: this.startClientX,
            currentClientY: this.startClientY,
            currentContainerRect: this.startContainerRect
        })
        this.children
            .filter(this.isElementDraggable)
            .forEach(el => {
                el.classList.remove(...this.startActiveClassList)
                el.classList.add(...this.dragActiveClassList)
            })

        this.emit('dragStart', {
            index: this.startIndex
        })
        // console.log('onDragStart', this.startIndex)
        // console.log('scrollinit', this.startContainerRect, this.scrollableParentsRect)
    }

    dragOver ({ currentClientX, currentClientY, currentContainerRect }) {
        this.updateDraggingModel({
            currentClientX,
            currentClientY,
            currentContainerRect
        })
        this.updateParentState(this.getParentState())
        this.emit('dragOver', { index: this.currentIndex })
        // console.log('onDragOver')
    }

    beforeDrop ({ clientX: currentClientX, clientY: currentClientY }) {
        // console.log('onDrop')
        this.updateDraggingModel({
            currentClientX,
            currentClientY
        })
        // console.log('beforeClear')
        this.clearScrollPeriods()

        this.updateDropModel({
            endClientX: currentClientX,
            endClientY: currentClientY,
            endContainerRect: this.currentContainerRect
            // startClientX,
            // startClientY
        })
        this.emit('beforeDrop', { index: this.endIndex })
    }

    // Fixme 判断移动到minimizeParentRect外，则判定拖拽重置
    drop ({ clientX, clientY }) {
        this.alignDropPosition()
        this.children
            .filter(this.isElementDraggable)
            .forEach(el => {
                el.classList.remove(...this.dragActiveClassList)
                el.classList.add(...this.dropActiveClassList)
            })
        this.emit('drop', {
            index: this.endIndex
        })
    }

    dragEnd () {
        // console.log('onDragEnd')
        this.updateStatus(DragDrop.INACTIVE)
        if (this.startIndex !== this.currentIndex) {
            this.updateInnerOrder()
            this.emit('orderChange', {
                from: this.startIndex,
                to: this.currentIndex,
                order: [...this.innerOrder]
            })
        }
        this.children
            .filter(this.isElementDraggable)
            .forEach(el => {
                el.classList.remove(...this.dropActiveClassList)
                el.classList.add(...this.dragInactiveClassList)
            })
        this.clearPlaceholder()
        this.clearDragStyle()
        this.clearDragState()
        this.emit('dragEnd')
        // console.log('dragEnd', this.innerOrder)
    }

    moveTarget ({ clientX, clientY }) {
        this.dragOver({ currentClientX: clientX, currentClientY: clientY })
        this.updateTargetPosition()
    }

    moveContainer () {
        this.updateScrollableParentRects()
        if (this.isDragging) {
            this.dragOver({
                currentContainerRect: this.container.getBoundingClientRect()
            })
            // TODO performance improvement point
            this.updateTargetPosition()
        }
        else {
            // Fixme 性能问题，考虑setTimeout，debounce等方式减少setDropStyle ?
            this.updateDropModel({
                endContainerRect: this.container.getBoundingClientRect()
            })
        }
    }

    resizeContainer () {
        // Fixme 未测试
        this.updateScrollableParents()
        this.updateScrollableParentRects()
        this.updateOrderedRects()
        if (this.isDragging) {
            this.updateDraggingModel({ currentContainerRect: this.container.getBoundingClientRect() })
            // console.log('updateDraggingModel from onContentScroll')
        }
        else {
            // Fixme 性能问题，考虑setTimeout，debounce等方式减少setDropStyle ?
            this.updateDropModel({
                endContainerRect: this.container.getBoundingClientRect()
            })
        }
    }

    // TODO 考虑item变化（dom、style）
    onItemChange () {
    }

    onEnterViewportEdge () {
        // Fixme updateScrollableParent时，如何解除
        // console.log('onEnterViewportEdge')
        const targets = this.scrollableParents.map(el => {
            return elementIsWindow(el) ? window : el
        })
        const prevent = e => {
            if (e.cancelable) {
                // console.log('prevent', e)
                e.preventDefault()
            }
        }
        const remove = () => {
            // console.log('removeViewportEdgeListener')
            targets.forEach(t => {
                t.removeEventListener('wheel', prevent)
                t.removeEventListener('touch', prevent)
            })
            this.off('drop', remove)
            this.off('leaveViewportEdge', remove)
        }
        targets.forEach(t => {
            t.addEventListener('wheel', prevent, { passive: false })
            t.addEventListener('touch', prevent, { passive: false })
        })
        this.on('leaveViewportEdge', remove)
        this.on('drop', remove)
    }
}
