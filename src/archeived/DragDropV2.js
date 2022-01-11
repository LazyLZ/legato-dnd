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

// Fixme state的整数化？小数会影响运算
// Fixme program scroll在到顶时小范围震动，大概率是小数取整导致的
// Fixme 可能存在listener泄露的问题（有listener未正确remove）
export class DragDrop extends EventEmitter {
    static INACTIVE = 0
    static DRAG_START_ACTIVE = 1
    static DRAGGING = 2
    static DROP_ACTIVE = 3
    static CANCEL_REASON = {
        EXCEED_OFFSET_LIMIT: 1,
        END_BEFORE_DELAY: 2
    }

    // element
    container
    scrollRoot
    placeholderElement
    // scrollable elements outside the scrollRoot
    scrollableParents = []

    // rect
    containerRect
    scrollRootRect

    // props
    vertical
    // Fixme 随距离变化
    transitionDuration
    placeholder
    // Fixme 改名， 优化props
    scrollDeltaFunction
    scrollEdgeThreshold
    viewport
    lockCrossAxis
    restrictMove
    // TODO 改变光标，有progress-circle
    startDelay
    touchStartDelay
    startOffsetTolerate

    // state
    _status = DragDrop.INACTIVE
    innerOrder = []
    isScrolling = false
    orderedBoxes = []
    _dropTimeout = null

    startIndex = NaN
    startClientX = NaN
    startClientY = NaN
    startPointerX = NaN
    startPointerY = NaN
    startScrollY = NaN
    startScrollX = NaN
    startTop = NaN
    startLeft = NaN

    currentIndex = NaN
    currentClientX = NaN
    currentClientY = NaN
    currentScrollY = NaN
    currentScrollX = NaN

    endClientX = NaN
    endClientY = NaN
    endScrollY = NaN
    endScrollX = NaN

    offsetWidth = NaN
    offsetHeight = NaN

    toEdgeValue = NaN
    toEdgeDirection = 0

    toContainerEdgeDirection = 0

    static defaultPlaceholder () {
        return document.createElement('div')
    }

    static defaultScrollDeltaFunction ({ offset, time, edge, direction }) {
        const alpha = 3
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
        // console.log('calculate', time, alpha, beta, direction)
        return alpha * beta * direction
    }

    constructor (
        {
            container,
            viewport,
            vertical = false,
            transitionDuration = 200,
            placeholder = DragDrop.defaultPlaceholder,
            scrollDeltaFunction = DragDrop.defaultScrollDeltaFunction,
            scrollEdgeThreshold = 0,
            lockCrossAxis = false,
            restrictMove = false,
            startDelay = 0,
            touchStartDelay = 300,
            startOffsetTolerate = 5
        }) {
        super()
        if (!(container instanceof HTMLElement)) {
            throw TypeError('Container need to be HTMLElement')
        }
        this.container = container

        // set props
        this.vertical = vertical
        this.transitionDuration = transitionDuration
        this.placeholder = placeholder
        this.scrollDeltaFunction = scrollDeltaFunction
        this.scrollEdgeThreshold = scrollEdgeThreshold
        this.viewport = viewport
        this.lockCrossAxis = lockCrossAxis
        this.restrictMove = restrictMove
        this.startDelay = startDelay
        this.touchStartDelay = touchStartDelay
        this.startOffsetTolerate = startOffsetTolerate

        // register inner listeners
        this.on('itemChange', this.onItemChange)
        // drag lifecycle
        this.on('pressStart', this.onPressStart)
        this.on('dragCanceled', this.onDragCanceled)
        this.on('dragstart', this.onDragstart)
        this.on('dragover', this.onDragover)
        this.on('drop', this.onDrop)
        this.on('dragend', this.onDragend)

        // layout
        this.on('dragCross', this.onDragCross)
        this.on('orderChange', this.onOrderChange)
        this.on('targetMove', this.onTargetMove)
        this.on('contentScroll', this.onContentScroll)
        this.on('viewportChange', this.onViewportChange)
        // this.on('programScrollStart', this.onProgramScrollStart)
        this.on('enterViewportEdge', this.onEnterViewportEdge)

        // register dom listeners
        this.children.forEach((el, i) => {
            this.bindMouseDragstartListeners(el, i)
            this.bindTouchDragstartListeners(el, i)
        })
        // bind class
        this.container.classList.add(CONTAINER_CLASS)
        this.children.forEach(el => {
            if (el.classList.contains(DRAGGABLE_CLASS)) {
                el.classList.add(DRAG_HANDLER_CLASS)
            }
        })
    }

    // functional
    distance (x1, y1, x2, y2) {
        return this.size(x1, y1) - this.size(x2, y2)
    }

    crossAxisDistance (x1, y1, x2, y2) {
        return this.crossAxisSize(x1, y1) - this.crossAxisSize(x2, y2)
    }

    size (x, y) {
        return this.vertical ? y : x
    }

    crossAxisSize (x, y) {
        return this.vertical ? x : y
    }

    isElementScrollable (el) {
        const scrollSize = this.size(el.scrollWidth, el.scrollHeight)
        const isRoot = el === document.documentElement
        const clientSize = isRoot
            ? this.size(window.innerWidth, window.innerHeight)
            : this.size(el.clientWidth, el.clientHeight)

        const style = window.getComputedStyle(el)
        const overflow = this.size(style.overflowX, style.overflowY)

        const scrollable = overflow === 'scroll' || overflow === 'auto' || (isRoot && overflow !== 'hidden')

        return {
            isScrollable: scrollSize > clientSize && scrollable,
            style
        }
    }

    // getters
    get children () {
        return [...this.container.children].filter(el => !el.classList.contains(PLACEHOLDER_CLASS))
    }

    get isDragging () {
        return this._status === DragDrop.DRAGGING
    }

    get isDragStarted () {
        return this._status >= DragDrop.DRAGGING
    }

    get isDropActive () {
        return this._status === DragDrop.DROP_ACTIVE
    }

    get isDragstartActive () {
        return this._status === DragDrop.DRAG_START_ACTIVE
    }

    // Fixme 需要优化属性定义和使用
    get scrollRootIsHtml () {
        return this.scrollRoot === document.documentElement
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

    startScroll () {
        const parent = this.scrollRoot
        if (!parent || this.isScrolling) return
        const isScrollToEnd = this.isScrollToEnd()
        if (isScrollToEnd) return
        this.isScrolling = true
        const startTimestamp = Date.now()
        let { scrollLeft, scrollTop } = parent
        if (this.scrollRootIsHtml) {
            scrollTop = window.scrollY
            scrollLeft = window.scrollX
        }
        const scrollOffset = this.size(scrollLeft, scrollTop)
        this.emit('programScrollStart', {
            offset: scrollOffset,
            startTimestamp,
            edge: this.toEdgeValue,
            direction: this.toEdgeDirection
        })
        const handler = () => {
            const toEdgeValue = this.toEdgeValue
            const direction = this.toEdgeDirection
            const scrollRootIsHtml = this.scrollRootIsHtml
            const timestamp = Date.now()
            const timeDelta = timestamp - startTimestamp
            let { scrollLeft, scrollTop, scrollWidth, scrollHeight } = parent
            if (scrollRootIsHtml) {
                scrollTop = window.scrollY
                scrollLeft = window.scrollX
                // clientWidth = window.innerWidth
                // clientHeight = window.innerHeight
            }
            const scrollSize = this.size(scrollWidth, scrollHeight)
            const scrollOffset = this.size(scrollLeft, scrollTop)
            const isScrollToEnd = this.isScrollToEnd()

            const eventPayload = {
                offset: scrollOffset,
                startTimestamp,
                time: timeDelta,
                edge: toEdgeValue,
                direction,
                isScrollToEnd
            }
            if (!this.isScrolling) {
                this.emit('programScrollStop', eventPayload)
                return
            }
            if (isNaN(toEdgeValue) || !direction) {
                this.stopScroll()
                window.requestAnimationFrame(handler)
                return
            }

            if (isScrollToEnd) {
                this.stopScroll()
                window.requestAnimationFrame(handler)
                return
            }
            const scrollDelta = this.scrollDeltaFunction({
                offset: scrollOffset,
                time: timeDelta,
                edge: toEdgeValue,
                direction
            })
            if (isNaN(scrollDelta)) {
                this.stopScroll()
                window.requestAnimationFrame(handler)
                throw new Error('scrollDelta cannot be NaN')
            }

            const target = scrollRootIsHtml ? window : parent
            const value = Math.ceil(Math.min(scrollOffset + scrollDelta, scrollSize))
            if (this.vertical) {
                target.scrollTo({ top: value })
            }
            else {
                target.scrollTo({ left: value })
            }
            // console.log('scroll', direction, scrollDelta)
            window.requestAnimationFrame(handler)
        }
        window.requestAnimationFrame(handler)
    }

    stopScroll () {
        this.isScrolling = false
    }

    findScrollRootElements () {
        let el = this.container
        let scrollRoot
        if (this.viewport == null) {
            while (el.parentElement) {
                el = el.parentElement

                const { isScrollable, style } = this.isElementScrollable(el)
                if (isScrollable) {
                    scrollRoot = el
                    break
                }
                if (style.position === 'fixed' || style.position === 'sticky') {
                    break
                }
            }
        }
        else if (this.viewport instanceof HTMLElement) {
            scrollRoot = this.viewport
        }
        else if (this.viewport === 'window') {
            scrollRoot = document.documentElement
        }
        else if (['false', 'none', false].indexOf(this.viewport) !== -1) {
            scrollRoot = undefined
        }
        else {
            throw Error('[DragDrop] viewport set error, got: ' + this.viewport)
        }

        return scrollRoot
    }

    alignDropPosition () {
        if (!this.scrollRoot) return
        // console.log('alignDropPosition')
        const boxDistance = this.getCrossedBoxDistance()
        const scrollSize = this.distance(
            this.startScrollX,
            this.startScrollY,
            this.endScrollX,
            this.endScrollY
        )
        const sRect = this.scrollRootRect
        const startMargin = this.size(this.startLeft, this.startTop)
        const startSize = this.size(this.offsetWidth, this.offsetHeight)
        const negative = startMargin + boxDistance + scrollSize
        const positive = startMargin + startSize + boxDistance + scrollSize
        const parentMargin = this.size(sRect.left, sRect.top)
        const parentSize = this.size(sRect.width, sRect.height)

        let target, scrollTop, scrollLeft
        if (this.scrollRootIsHtml) {
            target = window
            scrollTop = window.scrollY
            scrollLeft = window.scrollX
        }
        else {
            target = this.scrollRoot
            scrollTop = this.scrollRoot.scrollTop
            scrollLeft = this.scrollRoot.scrollLeft
        }
        const originPosition = this.size(scrollLeft, scrollTop)
        let newPosition
        if (negative < parentMargin) {
            // console.log('scrollTo negative', (parentMargin - negative), parentMargin, negative)
            newPosition = originPosition - (parentMargin - negative)
        }
        else if (positive > parentMargin + parentSize) {
            newPosition = originPosition + positive - (parentMargin + parentSize)
            // console.log('scrollTo positive', (positive - (parentMargin + parentSize)))
        }
        if (newPosition != null) {
            if (this.vertical) {
                target.scrollTo({ top: newPosition, behavior: 'smooth' })
            }
            else {
                target.scrollTo({ left: newPosition, behavior: 'smooth' })
            }
        }
    }

    // update state
    updateScrollRoot (options = { search: true }) {
        // Fixme item变化时要更新size判断
        if (options.search) {
            this.scrollRoot = this.findScrollRootElements()
            console.log('scrollRoot', this.scrollRoot)
        }
        // console.log('scrollable parent', this.scrollRoot, this.scrollRoot === document.documentElement)
        if (!this.scrollRoot) {
            this.scrollRootRect = undefined
            return
        }
        // const oldRect = this.scrollRootRect
        let newRect
        if (this.scrollRootIsHtml) {
            newRect = {
                top: 0,
                left: 0,
                right: window.innerWidth,
                bottom: window.innerHeight,
                width: window.innerWidth,
                height: window.innerHeight
            }
        }
        else {
            newRect = this.scrollRoot.getBoundingClientRect()
        }
        this.scrollRootRect = newRect
    }

    updateScrollableParents () {
        let el = this.scrollRoot || this.container
        let list = []

        // Fixme item变化时要更新size判断
        while (el.parentElement) {
            el = el.parentElement
            const { isScrollable, style } = this.isElementScrollable(el)

            if (isScrollable) {
                list.push(el)
            }
            if (style.position === 'fixed') {
                break
            }
        }
        this.scrollableParents = list
    }

    updateContainer () {
        this.containerRect = this.container.getBoundingClientRect()
    }

    updateOrderedBoxes () {
        // get boxes
        const boxes = this.children.map((el, index) => ({
            width: el.offsetWidth,
            height: el.offsetHeight,
            index
        }))
        // ordered
        this.orderedBoxes = boxes.map((box, i) => boxes[this.innerOrder[i]])
    }

    updateStatus (status) {
        this._status = status
    }

    setStartState (props) {
        const needProps = [
            'startIndex',
            'startClientX',
            'startClientY',
            'startScrollY',
            'startScrollX',
            'startTop',
            'startLeft',
            'offsetWidth',
            'offsetHeight'
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
        this.startPointerX = this.startClientX
        this.startPointerY = this.startClientY
        this.currentIndex = this.startIndex
        this.currentClientX = this.startClientX
        this.currentClientY = this.startClientY
        this.currentScrollX = this.startScrollX
        this.currentScrollY = this.startScrollY
    }

    safeSet (props, needProps, changeProps = []) {
        // Fixme debug 怀疑是判断StateChange时，取整干扰了判断，导致动画卡顿
        // let isStateChange = false
        let isStateChange = true
        let changeSet = new Set(changeProps)

        needProps.forEach(key => {
            const v = props[key]
            if (typeof v === 'number' && !isNaN(v)) {
                if (v !== this[key]) {
                    this[key] = v
                    if (changeSet.has(key)) {
                        isStateChange = true
                    }
                }
            }
            else {
                throw Error('[DragDrop] state error: ' + key + '=' + v)
            }
        })
        return isStateChange
    }

    setCurrentState (props) {
        const needProps = ['currentClientX', 'currentClientY', 'currentScrollX', 'currentScrollY', 'startClientX', 'startClientY']
        const changeProps = needProps.filter(p => p.endsWith(this.vertical ? 'Y' : 'X'))
        let isIndexChange = false
        let oldCurrentIndex = this.currentIndex
        // let isPointerChange, isScrollChange, isStartChange
        // const d = this.size('X', 'Y')
        // isPointerChange = props['currentClient' + d] !== this['currentClient' + d]
        // isScrollChange = props['currentScroll' + d] !== this['currentScroll' + d]
        // isStartChange = props['startClient' + d] !== this['startClient' + d]

        let isStateChange = this.safeSet(props, needProps, changeProps)
        if (isStateChange) {
            this.updateCurrentIndex()
            if (this.currentIndex !== oldCurrentIndex) {
                isIndexChange = true
            }
        }

        return {
            isIndexChange,
            isStateChange,
            oldCurrentIndex
            // isPointerChange,
            // isScrollChange,
            // isStartChange
        }
    }

    setEndState (props) {
        const needProps = ['endClientX', 'endClientY', 'endScrollX', 'endScrollY', 'startClientX', 'startClientY']
        const changeProps = needProps.filter(p => p.endsWith(this.vertical ? 'Y' : 'X'))
        let isStateChange = this.safeSet(props, needProps, changeProps)
        return { isStateChange }
    }

    updateCurrentIndex () {
        const d = this.distance(
            this.currentClientX + this.currentScrollX,
            this.currentClientY + this.currentScrollY,
            this.startClientX + this.startScrollX,
            this.startClientY + this.startScrollY
        )

        const boxes = this.orderedBoxes
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

    makePlaceholder () {
        const placeholder = this.placeholder()
        placeholder.classList.add(PLACEHOLDER_CLASS)

        const s = placeholder.style
        s.height = this.offsetHeight + 'px'
        s.width = this.offsetWidth + 'px'
        this.placeholderElement = placeholder
    }

    setDragoverStaticStyle () {
        this.children.forEach((el, i) => {
            const s = el.style
            if (i === this.startIndex) {
                s.zIndex = 2
                s.position = 'fixed'
                const { startTop, startLeft, offsetHeight, offsetWidth } = this
                s.top = startTop + 'px'
                s.left = startLeft + 'px'
                s.height = offsetHeight + 'px'
                s.width = offsetWidth + 'px'
                s.transitionDuration = '0'
                s.transitionTimingFunction = ''
                s.transitionProperty = ''
                s.pointerEvents = 'none'
            }
            // dragging/dragend-active-other-el
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

    setDropStyle () {
        const el = this.children[this.startIndex]
        if (el) {
            const s = el.style
            s.transitionTimingFunction = 'ease'
            s.transitionProperty = 'all'
            // Fixme 动态配置
            s.transitionDuration = `${this.transitionDuration}ms`

            const boxDistance = this.getCrossedBoxDistance()
            const scrollDelta = this.distance(
                this.endScrollX,
                this.endScrollY,
                this.startScrollX,
                this.startScrollY
            )
            const viewportDelta = this.distance(
                this.startClientX,
                this.startClientY,
                this.startPointerX,
                this.startPointerY
            )
            const dragendDistance = boxDistance - scrollDelta + viewportDelta
            const direction = this.vertical ? 'Y' : 'X'
            // console.log('setDrop', `translate${direction}(${dragendDistance}px)`)
            s.transform = `translate${direction}(${dragendDistance}px)`
        }

    }

    updateOtherItemPosition () {
        this.children.forEach((el, i) => {
            let s = el.style
            const [start, to] = [this.startIndex, this.currentIndex]

            // dynamic style
            const direction = this.size('X', 'Y')

            let value
            if ((i > start && i <= to) || (i >= to && i < start)) {
                const startBox = this.orderedBoxes[start]
                const startSize = this.size(startBox.width, startBox.height)
                value = start < to ? -startSize : startSize
            }
            else {
                value = 0
            }
            s.transform = `translate${direction}(${value}px)`
        })
    }

    updateTargetPosition () {
        const direction = this.size('X', 'Y')
        const crossAxisDirection = this.crossAxisSize('X', 'Y')
        const el = this.children[this.startIndex]
        if (el) {
            // const params = [this.currentClientX, this.currentClientY, this.startClientX, this.startClientY]
            const params = [this.currentClientX, this.currentClientY, this.startPointerX, this.startPointerY]
            let value = this.distance(...params)
            const crossValue = this.lockCrossAxis || this.restrictMove ? 0 : this.crossAxisDistance(...params)

            el.style.transform = `translate${direction}(${value}px) translate${crossAxisDirection}(${crossValue}px)`
        }
    }

    updatePlaceholderPosition () {
        const style = this.placeholderElement.style
        const direction = this.size('X', 'Y')
        const boxDistance = this.getCrossedBoxDistance()
        style.transform = `translate${direction}(${boxDistance}px)`
    }

    // Fixme 超大物体，体验不好，移动端，设置为0体验不好，横向滚动，移动端，体验不好
    updateToEdgeState () {
        // Fixme viewportChange事件会更新此值，因此可能不是start时的值，但暂时无影响，原因未知
        const parentRect = this.scrollRootRect
        if (!parentRect) {
            this.toEdgeValue = NaN
            this.toEdgeDirection = 0
            return
        }

        // const { startScrollX: ssrX, startScrollY: ssrY, currentScrollY: csrY, currentScrollX: csrX } = this
        // const containerRect = this.containerRect
        // const containerMargin = this.size(containerRect.left, containerRect.top) - this.distance(csrX, csrY, ssrX, ssrY)
        const parentMargin = this.size(parentRect.left, parentRect.top)
        // const containerSize = this.size(containerRect.width, containerRect.height)
        const parentSize = this.size(parentRect.width, parentRect.height)

        const { startTop, startLeft, offsetWidth, offsetHeight } = this
        const { startPointerX: spX, startPointerY: spY, currentClientY: cY, currentClientX: cX } = this
        const startRight = startLeft + offsetWidth
        const startBottom = startTop + offsetHeight

        const positivePoint = this.size(startRight + cX - spX, startBottom + cY - spY)
        const negativePoint = this.size(startLeft + cX - spX, startTop + cY - spY)
        const positive = parentMargin + parentSize - positivePoint
        const negative = negativePoint - parentMargin

        let value
        let direction
        if (positive > negative) {
            // value = containerMargin > parentMargin ? NaN : negative
            value = negative
            direction = -1
        }
        else {
            // value = containerMargin + containerSize < parentMargin + parentSize ? NaN : positive
            value = positive
            direction = 1
        }
        // console.log('p', startBottom, cY , spY)
        // console.log('positive edge', containerMargin, parentMargin, positive, value)
        // console.log('negative edge', containerMargin + containerSize, parentMargin + parentSize, negative, value)
        // console.log('updateToEdge', value, direction, this.scrollEdgeThreshold)
        if (value > this.scrollEdgeThreshold) {
            value = NaN
        }

        this.toEdgeValue = value
        this.toEdgeDirection = direction
    }

    updateDraggingModel
    ({
        currentClientX = this.currentClientX,
        currentClientY = this.currentClientY,
        currentScrollX = this.currentScrollX,
        currentScrollY = this.currentScrollY,
        startClientX = this.startClientX,
        startClientY = this.startClientY
    }) {
        let toEdgeDirection
        if (this.restrictMove) {
            let move = this.distance(
                currentClientX,
                currentClientY,
                this.startPointerX,
                this.startPointerY
            )
            const rect = this.containerRect
            const scrollSize = this.distance(
                currentScrollX,
                currentScrollY,
                this.startScrollX,
                this.startScrollY
            )
            let maxMove = this.size(
                rect.right - (this.startLeft + this.offsetWidth),
                rect.bottom - (this.startTop + this.offsetHeight)
            ) - scrollSize
            let minMove = this.size(
                rect.left - this.startLeft,
                rect.top - this.startTop
            ) - scrollSize

            maxMove = Math.round(maxMove)
            minMove = Math.round(minMove)
            if (move >= maxMove) {
                toEdgeDirection = 1
                // console.log('move to edge', toEdgeDirection, move, maxMove, minMove)
                move = maxMove
            }
            else if (move <= minMove) {
                toEdgeDirection = -1
                // console.log('move to edge', toEdgeDirection, move, maxMove, minMove)
                move = minMove
            }
            else {
                toEdgeDirection = 0
                // console.log('move to edge', toEdgeDirection, move, maxMove, minMove)
            }
            if (this.vertical) {
                currentClientY = Math.round(move + this.startPointerY)
            }
            else {
                currentClientX = Math.round(move + this.startPointerX)
            }
            // console.log('move', move, maxMove, minMove)
        }
        const { isIndexChange, isStateChange, oldCurrentIndex } = this.setCurrentState({
            currentScrollX,
            currentScrollY,
            currentClientX,
            currentClientY,
            startClientX,
            startClientY
        })
        // console.log('dragover', isStateChange, isIndexChange)

        if (isIndexChange) {
            this.emit('dragCross', {
                start: this.startIndex,
                current: this.currentIndex,
                oldCurrent: oldCurrentIndex
            })
        }
        if (isStateChange) {
            // check if is close to edge
            const oldValue = this.toEdgeValue
            this.updateToEdgeState()
            const newValue = this.toEdgeValue
            // console.log('toEdge', this.toEdgeValue, this.toEdgeDirection)
            if (isNaN(oldValue) && !isNaN(newValue)) {
                this.emit('enterViewportEdge', {
                    edge: this.toEdgeValue,
                    direction: this.toEdgeDirection
                })
            }
            if (!isNaN(oldValue) && isNaN(newValue)) {
                this.emit('leaveViewportEdge')
            }

            if (!isNaN(this.toEdgeValue) && newValue !== oldValue && !this.isScrolling) {
                this.startScroll()
            }
            this.emit('targetMove', {
                clientX: currentClientX,
                clientY: currentClientY,
                scrollX: currentScrollX,
                scrollY: currentScrollY
            })
        }
        if (!this.toContainerEdgeDirection && toEdgeDirection) {
            this.emit('moveToEdge', { toEdgeDirection })
        }
        this.toContainerEdgeDirection = toEdgeDirection
        // console.log('toEdge', toEdgeDirection)
        // console.log('dragover', this.currentIndex, isIndexChange, isStateChange)
    }

    updateDropModel
    ({
        endScrollX = this.endScrollX,
        endScrollY = this.endScrollY,
        endClientX = this.endClientX,
        endClientY = this.endClientY,
        startClientX = this.startClientX,
        startClientY = this.startClientY
    }) {
        this.updateStatus(DragDrop.DROP_ACTIVE)
        this.setEndState({
            endScrollX,
            endScrollY,
            endClientX,
            endClientY,
            startClientX,
            startClientY
        })
        // console.log('positive', this.startTop + this.offsetHeight + boxDistance, sRect.bottom)
        // console.log('negative', this.startTop + boxDistance, sRect.top)
        this.setDropStyle()
        clearTimeout(this._dropTimeout)
        this._dropTimeout = setTimeout(() => {
            this.emit('dragend', {
                from: this.startIndex,
                to: this.currentIndex
            })
        }, this.transitionDuration)
    }

    clearDragState () {
        this.containerRect = undefined
        this.scrollRootRect = undefined
        this.scrollRoot = undefined
        this.scrollableParents = []

        this.startIndex = NaN
        this.startClientX = NaN
        this.startClientY = NaN
        this.startScrollY = NaN
        this.startScrollX = NaN
        this.startPointerX = NaN
        this.startPointerY = NaN
        this.startTop = NaN
        this.startLeft = NaN

        this.currentIndex = NaN
        this.currentClientX = NaN
        this.currentClientY = NaN
        this.currentScrollY = NaN
        this.currentScrollX = NaN

        this.endClientX = NaN
        this.endClientY = NaN
        this.endScrollY = NaN
        this.endScrollX = NaN

        this.offsetWidth = NaN
        this.offsetHeight = NaN

        this.toEdgeValue = NaN
        this.toEdgeDirection = 0
        this.toContainerEdgeDirection = 0

        this.isScrolling = false

        this.innerOrder = []
        this.orderedBoxes = []

        this._dropTimeout = null
    }

    clearDragStyle () {
        let styles = [
            'zIndex',
            'transitionDuration',
            'transitionTimingFunction',
            'transitionProperty',
            'pointerEvents',
            'transform',
            'position',
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

    updateInnerOrder () {
        let list = [...this.innerOrder]
        const children = this.children
        if (list.length !== children.length) {
            list = children.map((c, i) => i)
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
        }

        this.innerOrder = list
    }

    // get dom
    getScrollState () {
        const el = this.scrollRoot
        if (!el) {
            return { scrollTop: 0, scrollLeft: 0 }
        }
        return this.scrollRootIsHtml
            ? { scrollTop: window.scrollY, scrollLeft: window.scrollX }
            : { scrollTop: el.scrollTop, scrollLeft: el.scrollLeft }
    }

    isScrollToEnd () {
        const parent = this.scrollRoot
        const direction = this.toEdgeDirection
        if (!parent || !direction) return true
        let { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = parent
        if (this.scrollRootIsHtml) {
            scrollTop = window.scrollY
            scrollLeft = window.scrollX
            clientWidth = window.innerWidth
            clientHeight = window.innerHeight
        }
        const scrollOffset = this.size(scrollLeft, scrollTop)
        const scrollSize = this.size(scrollWidth, scrollHeight)
        const clientSize = this.size(clientWidth, clientHeight)
        let isScrollToEnd
        // console.log('scroll end', scrollOffset, clientSize, scrollSize)
        if (direction > 0) {
            isScrollToEnd = Math.round(scrollOffset + clientSize) >= Math.round(scrollSize)
        }
        else {
            isScrollToEnd = Math.round(scrollOffset) === 0
        }
        return isScrollToEnd
    }

    // compute
    // directional
    getCrossedBoxDistance () {
        const [start, to] = [this.startIndex, this.currentIndex]
        return (start < to ? 1 : -1) * this.orderedBoxes
            .filter((box, i) => {
                return (i > start && i <= to) || (i < start && i >= to)
            })
            .reduce((t, box) => t + this.size(box.width, box.height), 0)
    }

    // register dom listener
    bindMouseDragstartListeners (el, index) {
        el.addEventListener('mousedown', e => {
            // console.log('mousedown event', e, index)
            if (+e.button !== 0) return
            if (this.isDragStarted || this.isDragstartActive) return
            e.preventDefault()
            e.stopPropagation()
            this.blurActiveElement()

            const payload = {
                clientX: e.clientX,
                clientY: e.clientY,
                index,
                event: e,
                element: el
            }
            if (this.startDelay) {
                this.delayMouseDragstart(payload)
            }
            else {
                this.emit('pressStart', payload)
                this.emit('dragstart', payload)
                // bind events
                this.bindMouseLifecycleListeners()
            }
        })
    }

    bindEnvironmentListeners (el, index) {
        // scroll
        const scroll = e => {
            window.requestAnimationFrame(() => {
                if (!this.isDragStarted) return
                // const isContentScroll = e.target === scrollTarget ||
                //     (e.target === document && scrollTarget === window)
                // console.log('scroll event', isContentScroll)
                this.emit('contentScroll', e)
            })
        }
        const scrollTarget = this.scrollRootIsHtml ? window : this.scrollRoot

        const otherScrollTargets = this.scrollableParents.map(el => {
            return el === document.documentElement ? window : el
        })
        const otherScroll = e => {
            window.requestAnimationFrame(() => {
                if (!this.isDragStarted) return
                this.emit('viewportChange', e)
            })
        }

        // resize
        const resize = e => {
            window.requestAnimationFrame(() => {
                if (!this.isDragStarted) return
                this.emit('viewportChange', e)
            })
        }
        if (scrollTarget) {
            scrollTarget.addEventListener('scroll', scroll, { passive: true })
        }
        otherScrollTargets.forEach(t => {
            t.addEventListener('scroll', otherScroll, { passive: true })
        })
        window.addEventListener('resize', resize, { passive: true })
        this.once('dragend', () => {
            window.removeEventListener('resize', resize)
            if (scrollTarget) {
                scrollTarget.removeEventListener('scroll', scroll)
            }
            otherScrollTargets.forEach(t => {
                t.removeEventListener('scroll', otherScroll)
            })
        })

    }

    // Fixme 未考虑滚动和resize等其他事件，需要建立一个pressMove事件控制
    delayMouseDragstart ({ clientX, clientY, index, event, element }) {
        this.updateStatus(DragDrop.DRAG_START_ACTIVE)
        let endX = clientX
        let endY = clientY
        let pid

        const mousemove = e => {
            window.requestAnimationFrame(() => {
                endX = e.clientX
                endY = e.clientY
                if (
                    Math.abs(endX - clientX) > this.startOffsetTolerate ||
                    Math.abs(endY - clientY) > this.startOffsetTolerate
                ) {
                    window.removeEventListener('mouseup', mouseup)
                    window.removeEventListener('mousemove', mousemove)
                    clearTimeout(pid)
                    this.updateStatus(DragDrop.INACTIVE)
                    this.emit('dragCanceled', {
                        clientX, clientY, index, event, element,
                        type: DragDrop.CANCEL_REASON.EXCEED_OFFSET_LIMIT
                    })
                    // console.log('move exceed limit')
                }
            })
        }
        const mouseup = () => {
            window.removeEventListener('mousemove', mousemove)
            clearTimeout(pid)
            this.updateStatus(DragDrop.INACTIVE)
            this.emit('dragCanceled', {
                clientX, clientY, index, event, element,
                type: DragDrop.CANCEL_REASON.END_BEFORE_DELAY
            })
            // console.log('mouseup before delay')
        }

        pid = setTimeout(() => {
            window.removeEventListener('mouseup', mouseup)
            window.removeEventListener('mousemove', mousemove)
            this.emit('dragstart', { clientX: endX, clientY: endY, index, event, element })
            // bind events
            this.bindMouseLifecycleListeners()
        }, this.startDelay)
        // console.log('start count')
        this.emit('pressStart', { clientX, clientY, index, event, element })
        window.addEventListener('mousemove', mousemove, { passive: true })
        window.addEventListener('mouseup', mouseup, { once: true })
    }

    bindMouseLifecycleListeners () {
        // dragover
        const dragover = e => {
            // trigger by touch
            if (!e.movementX && !e.movementY) return
            window.requestAnimationFrame(() => {
                if (!this.isDragging) return
                this.emit('dragover', e)
            })
        }
        window.addEventListener('mousemove', dragover, { passive: true })

        // drop
        window.addEventListener('mouseup', e => {
            e.preventDefault()
            e.stopPropagation()
            window.removeEventListener('mousemove', dragover)
            this.emit('drop', { clientX: e.clientX, clientY: e.clientY })
        }, { once: true })
    }

    bindTouchDragstartListeners (el, index) {
        el.addEventListener('touchstart', e => {
            // console.log('touchstart event', e, index)
            if (e.cancelable) {
                e.preventDefault()
            }
            e.stopPropagation()
            if (this.isDragStarted || this.isDragstartActive) return
            const rect = el.getBoundingClientRect()
            const touch = [...e.touches].find(t => {
                const { clientX: x, clientY: y } = t
                return x >= rect.left && x <= rect.right &&
                    y >= rect.top && y <= rect.bottom
            })
            if (!touch) return

            this.blurActiveElement()

            const payload = {
                clientX: Math.round(touch.clientX),
                clientY: Math.round(touch.clientY),
                index,
                event: e,
                element: el,
                touchId: touch.identifier
            }
            if (this.startDelay || this.touchStartDelay) {
                this.delayTouchDragstart(payload)
            }
            else {
                this.emit('pressStart', payload)
                this.emit('dragstart', payload)
                // bind events
                this.bindTouchLifecycleListeners(touch.identifier)
            }
        })
    }

    delayTouchDragstart ({ clientX, clientY, index, event, element, touchId }) {
        const delayMs = this.touchStartDelay || this.startDelay
        let endX = clientX
        let endY = clientY
        let pid

        const touchmove = e => {
            if (e.cancelable) {
                e.preventDefault()
            }
            window.requestAnimationFrame(() => {
                const touch = [...e.touches].find(t => t.identifier === touchId)
                if (!touch) return
                endX = touch.clientX
                endY = touch.clientY
                if (
                    Math.abs(endX - clientX) > this.startOffsetTolerate ||
                    Math.abs(endY - clientY) > this.startOffsetTolerate
                ) {
                    window.removeEventListener('touchend', touchend)
                    window.removeEventListener('touchmove', touchmove)
                    clearTimeout(pid)
                    this.updateStatus(DragDrop.INACTIVE)
                    this.emit('dragCanceled', {
                        clientX, clientY, index, event, element,
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
            window.removeEventListener('touchmove', touchmove)
            clearTimeout(pid)
            this.updateStatus(DragDrop.INACTIVE)
            this.emit('dragCanceled', {
                clientX, clientY, index, event, element,
                type: DragDrop.CANCEL_REASON.END_BEFORE_DELAY
            })
            // console.log('touched before delay')
        }

        pid = setTimeout(() => {
            window.removeEventListener('touchend', touchend)
            window.removeEventListener('touchmove', touchmove)
            this.emit('dragstart', { clientX: endX, clientY: endY, index, event, element })
            // bind events
            this.bindTouchLifecycleListeners(touchId)
        }, delayMs)
        // console.log('start count')
        this.updateStatus(DragDrop.DRAG_START_ACTIVE)
        this.emit('pressStart', { clientX, clientY, index, event, element })
        window.addEventListener('touchmove', touchmove, { passive: false })
        window.addEventListener('touchend', touchend, { once: true })
    }

    bindTouchLifecycleListeners (touchId) {
        // dragover
        const dragover = e => {
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
                    this.emit('dragover', {
                        clientX: Math.round(touch.clientX),
                        clientY: Math.round(touch.clientY)
                    })
                })
            }
        }
        window.addEventListener('touchmove', dragover, { passive: false })

        // drop
        const touchend = e => {
            if (e.cancelable) {
                e.preventDefault()
            }
            e.stopPropagation()
            window.removeEventListener('touchmove', dragover)
            const touch = [...e.changedTouches].find(t => t.identifier === touchId)
            // console.log('touchend', e)
            if (touch) {
                this.emit('drop', {
                    clientX: Math.round(touch.clientX),
                    clientY: Math.round(touch.clientY)
                })
                window.removeEventListener('touchend', touchend)
            }
        }
        window.addEventListener('touchend', touchend)
    }

    onItemChange () {

    }

    // drag lifecycle
    onPressStart () {

    }

    onDragCanceled () {

    }

    // Fixme error handler
    onDragstart ({ clientX: startClientX, clientY: startClientY, index: startIndex }) {
        // update layout state
        // console.log('onDragstart', startIndex, startClientX, startClientY)
        this.updateStatus(DragDrop.DRAGGING)
        this.updateScrollRoot()
        this.updateScrollableParents()
        this.updateContainer()
        this.updateInnerOrder()
        this.updateOrderedBoxes()
        this.container.focus()

        this.bindEnvironmentListeners()

        const el = this.children[startIndex]
        const { scrollLeft: startScrollX, scrollTop: startScrollY } = this.getScrollState()
        const { top: startTop, left: startLeft, width: offsetWidth, height: offsetHeight } = el.getBoundingClientRect()

        // set state
        this.setStartState({
            startClientX,
            startClientY,
            startScrollX,
            startScrollY,
            startIndex,
            startTop,
            startLeft,
            offsetWidth,
            offsetHeight
        })

        // make placeholder
        this.makePlaceholder()
        this.setDragoverStaticStyle()
        el.after(this.placeholderElement)
    }

    onDragover
    ({
        clientX: currentClientX,
        clientY: currentClientY
    }) {
        const { scrollLeft: currentScrollX, scrollTop: currentScrollY } = this.getScrollState()
        this.updateDraggingModel({
            currentClientX,
            currentClientY,
            currentScrollX,
            currentScrollY
        })
        // console.log('updateDraggingModel from dragover')
    }

    onDrop ({ clientX: currentClientX, clientY: currentClientY }) {
        const { scrollLeft: currentScrollX, scrollTop: currentScrollY } = this.getScrollState()
        this.updateDraggingModel({
            currentClientX,
            currentClientY,
            currentScrollX,
            currentScrollY
        })
        // console.log('updateDraggingModel from onDrop')
        this.stopScroll()
        if (!isNaN(this.toEdgeValue)) {
            this.toEdgeValue = NaN
            this.toEdgeDirection = NaN
            this.emit('leaveViewportEdge')
        }
        this.updateDropModel({
            endScrollX: currentScrollX,
            endScrollY: currentScrollY,
            endClientX: currentClientX,
            endClientY: currentClientY
            // startClientX,
            // startClientY
        })
        this.alignDropPosition()
    }

    onDragend () {
        this.updateStatus(DragDrop.INACTIVE)
        if (this.startIndex !== this.currentIndex) {
            this.updateInnerOrder()
            this.emit('orderChange', {
                from: this.startIndex,
                to: this.currentIndex,
                order: [...this.innerOrder]
            })
        }
        this.clearDragState()
        this.clearDragStyle()
        this.clearPlaceholder()
    }

    // container/parent events
    onContentScroll () {
        if (this.isDragging) {
            const { scrollLeft: currentScrollX, scrollTop: currentScrollY } = this.getScrollState()
            this.updateDraggingModel({ currentScrollX, currentScrollY })
            // console.log('updateDraggingModel from onContentScroll')
        }
        else {
            // Fixme 性能问题，考虑setTimeout，debounce等方式减少setDropStyle ?
            const [endClientX, endClientY] = [this.endClientX, this.endClientY]
            const { scrollLeft: endScrollX, scrollTop: endScrollY } = this.getScrollState()

            this.updateDropModel({
                endScrollX,
                endScrollY,
                endClientX,
                endClientY
            })
        }
    }

    // Fixme 性能问题通过计算滚动距离向量和的方式优化
    onViewportChange () {
        // console.log('viewportChange', e)
        this.updateContainer()
        let oldRect = this.scrollRootRect
        this.updateScrollRoot({ search: false })
        let newRect = this.scrollRootRect
        let dX, dY
        if (oldRect) {
            dX = newRect.left - oldRect.left
            dY = newRect.top - oldRect.top
        }

        if (this.isDragging) {
            this.updateDraggingModel({
                startClientX: this.startClientX + dX,
                startClientY: this.startClientY + dY
            })
            // console.log('updateDraggingModel from onViewportChange')
        }
        else {
            // Fixme 性能问题，考虑setTimeout，debounce等方式减少setDropStyle ?
            const { scrollLeft: endScrollX, scrollTop: endScrollY } = this.getScrollState()
            this.updateDropModel({
                endScrollX,
                endScrollY,
                startClientX: this.startClientX + dX,
                startClientY: this.startClientY + dY
            })
        }
    }

    // dragState change
    onDragCross () {
        this.updateOtherItemPosition()
        this.updatePlaceholderPosition()
    }

    onOrderChange () {

    }

    onTargetMove () {
        this.updateTargetPosition()
    }

    onEnterViewportEdge () {
        if (!this.scrollRoot) return
        // console.log('onEnterViewportEdge')
        const target = this.scrollRootIsHtml ? window : this.scrollRoot
        const prevent = e => {
            if (e.cancelable) {
                e.preventDefault()
            }
        }
        target.addEventListener('wheel', prevent)
        target.addEventListener('touch', prevent)
        this.once('leaveViewportEdge', () => {
            // console.log('onLeaveViewportEdge')
            target.removeEventListener('wheel', prevent)
            target.removeEventListener('touch', prevent)
        })
    }
}
