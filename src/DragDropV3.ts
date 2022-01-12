import EventEmitter from 'eventemitter3'

type Timeout = ReturnType<typeof setTimeout>

import {
    CONTAINER_CLASS,
    PLACEHOLDER_CLASS,
    DRAGGABLE_CLASS,
    DISABLED_CLASS,
    HANDLER_CLASS,
    VERTICAL_CONTAINER_CLASS,
    HORIZONTAL_CONTAINER_CLASS,
    // DRAG_HANDLER_CLASS
} from './const'


export function draggable(el: HTMLElement, options?: { handler: boolean }): HTMLElement {
    const {handler = true} = options || {}
    el.classList.add(DRAGGABLE_CLASS)
    if (handler) {
        el.classList.add(HANDLER_CLASS)
    }
    return el
}

export function handler(el: HTMLElement): HTMLElement {
    el.classList.add(HANDLER_CLASS)
    return el
}

// export function config () {
//     console.log('config class')
// }


export interface IntersectStatePropsType {
    root?: DOMRectReadOnly,
    target?: DOMRectReadOnly,
    orientation?: string,
    threshold?: number
}

const defaultCompare = (a: any, b: any): number => a - b

export interface BinarySearchOptions<T> {
    compare?: (a: T, b: T) => number,
    exact?: boolean
}

function binarySearch<T>(list: T[], v: T, options?: BinarySearchOptions<T>) {
    const {compare = defaultCompare, exact = true} = options || {}
    let l = 0, r = list.length
    let mid = Math.floor((r + l) / 2)
    let c = compare(v, list[mid])
    while (l < r) {
        // console.log('loop', l, r, mid, c)
        if (c > 0) {
            l = mid + 1
        } else {
            r = mid
        }
        mid = Math.floor((r + l) / 2)
        c = compare(v, list[mid])
    }
    return c && exact ? -1 : l
}

const STYLE_ELEMENT_ID = 'legato-dnd-style'
type CSSRule = [string, { [key: string]: string | number }]
const cssRules: CSSRule[] = [
    ['', {}],
]

function addCssRules(rules: CSSRule[]) {
    let style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null
    if (!style) {
        style = document.createElement('style')
        style.id = STYLE_ELEMENT_ID
        document.head.appendChild(style)
    }
    const sheet = style.sheet
    if (sheet) {
        for (let i = 0; i < sheet.cssRules.length; ++i) {
            sheet.deleteRule(i)
        }
        rules.forEach(([selector, lines], i) => {
            const lineStr = Object.entries(lines).map(([k, v]) => `${k}: ${v};`).join('\n')
            sheet.insertRule(`${selector} { ${lineStr} }`, i)
        })
        // const colorsRule = `outline: 1px solid red`
        // console.log('add', `:root { ${colorsRule} }`)
    }
}

addCssRules([
    [`.${CONTAINER_CLASS}`, {
        'padding': 0,
        'border': 0,
        'overflow': 'visible',
        'flex-wrap': 'nowrap',
    }],
    [`.${CONTAINER_CLASS}.${HORIZONTAL_CONTAINER_CLASS}`, {
        display: 'flex',
        float: 'left',
    }],
    [`.${CONTAINER_CLASS} > *`, {
        margin: 0,
        position: 'relative',
    }],
    [`.${CONTAINER_CLASS} .${HANDLER_CLASS}`, {
        cursor: 'move',
    }],
])


export class IntersectState {
    direction = NaN
    value = NaN
    dPositive = NaN
    dNegative = NaN
    threshold = 0
    orientation: 'X' | 'Y' | ''
    root: DOMRectReadOnly | undefined
    target: DOMRectReadOnly | undefined

    constructor({root, target, orientation = '', threshold = 0}: IntersectStatePropsType) {
        this.root = root
        this.target = target
        this.threshold = threshold
        this.orientation = orientation.toUpperCase() as 'X' | 'Y'
        if (!root || !target) return

        const dPositive = this.size(
            root.right - target.right,
            root.bottom - target.bottom,
        )
        const dNegative = this.size(
            root.left - target.left,
            root.top - target.top,
        )
        let direction = NaN
        let value = NaN
        if (dPositive <= threshold && dNegative >= -threshold) {
            direction = 2
        } else if (dPositive > threshold && dNegative < -threshold) {
            direction = 0
        } else if (dPositive > threshold && dNegative >= -threshold) {
            direction = -1
            value = dNegative
        } else if (dPositive <= threshold && dNegative < -threshold) {
            direction = 1
            value = dPositive
        }
        this.dPositive = dPositive
        this.dNegative = dNegative
        this.direction = direction
        this.value = value
    }

    size(x: any, y: any) {
        return this.orientation === 'X' ? x : y
    }

    // include value = 0
    get isIntersecting() {
        return this.direction === 1 || this.direction === -1
    }
}

export interface ScrollStatePropTypes {
    el?: HTMLElement | Window
    rect?: DOMRectReadOnly
    index?: number
    orientation?: 'X' | 'Y' | ''
}

export class ScrollState {
    scrollOffset = NaN
    scrollSize = NaN
    clientSize = NaN
    el
    rect
    index = NaN
    orientation

    constructor({el, index, rect, orientation = ''}: ScrollStatePropTypes) {
        this.orientation = orientation.toUpperCase() as 'X' | 'Y'
        this.index = index == null ? NaN : index
        this.el = el
        if (!this.el) return

        this.rect = rect
        if (!rect) {
            if (elementIsWindow(el)) {
                this.rect = DOMRectReadOnly.fromRect({
                    x: 0,
                    y: 0,
                    width: window.innerWidth,
                    height: window.innerHeight,
                })
            } else {
                this.rect = (this.el as HTMLElement).getBoundingClientRect()
            }
        }
        let scrollOffset, clientSize, scrollSize
        if (elementIsWindow(el)) {
            if (this.orientation === 'X') {
                scrollOffset = window.scrollX
                clientSize = window.innerWidth
                scrollSize = document.documentElement.scrollWidth
            } else {
                scrollOffset = window.scrollY
                clientSize = window.innerHeight
                scrollSize = document.documentElement.scrollHeight
            }
        } else {
            const el = this.el as HTMLElement
            if (this.orientation === 'X') {
                scrollOffset = el.scrollLeft
                clientSize = el.clientWidth
                scrollSize = el.scrollWidth
            } else {
                scrollOffset = el.scrollTop
                clientSize = el.clientHeight
                scrollSize = el.scrollHeight
            }
        }
        this.scrollSize = scrollSize
        this.scrollOffset = scrollOffset
        this.clientSize = clientSize
    }

    isToEnd(direction: number) {
        // console.log('isToEnd', this.el, this.scrollOffset, this.clientSize, this.scrollSize)
        if ([this.scrollOffset, this.clientSize, this.scrollSize].some(isNaN)) return true
        let isEnd = true
        if (direction === 1) {
            isEnd = Math.round(this.scrollOffset + this.clientSize) >= Math.round(this.scrollSize)
        }
        if (direction === -1) {
            isEnd = this.scrollOffset === 0
        }
        return isEnd
    }
}

export interface ParentStatePropTypes {
    itemIntersectState?: IntersectState
    containerIntersectState?: IntersectState,
    scrollState?: ScrollState
}

// Fixme 当前状态的滚动+scrollDelta后，可能超过应该滚动的距离
export class ParentState {
    itemIntersectState = new IntersectState({})
    containerIntersectState = new IntersectState({})
    scrollState = new ScrollState({})

    constructor({itemIntersectState, containerIntersectState, scrollState}: ParentStatePropTypes) {
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

    get isNearEdge() { // 物品是否接近边界
        return this.itemIntersectState.isIntersecting
    }

    get isScrollable() {
        // 是否有parent可滚动(指定方向)
        return !this.scrollState.isToEnd(this.itemIntersectState.direction)
    }

    get isFullVisible() {
        // Container在滚动方向是否已经完全可见

        const itemDirection = this.itemIntersectState.direction
        const {dPositive, dNegative, threshold} = this.containerIntersectState
        // const padding = 32
        if (itemDirection === 1) {
            return dPositive >= (threshold)
        }
        if (itemDirection === -1) {
            return dNegative <= -(threshold)
        }
        return (dNegative <= threshold && dPositive >= -threshold)
    }

    get hasItemMoveSpace() {
        const rect = this.containerIntersectState.target
        const {isIntersecting, direction, orientation, target: itemRect} = this.itemIntersectState
        if (!rect || !isIntersecting || !itemRect) return false
        let v
        if (orientation === 'X') {
            v = direction === 1 ? window.innerWidth - rect.right : rect.left
            // console.log('compute move space', v, v >= itemRect.width)
            return v >= itemRect.width
        } else {
            v = direction === 1 ? window.innerHeight - rect.bottom : rect.top
            // console.log('compute move space', v, v >= itemRect.height)
            return v >= itemRect.height
        }
    }

    get shouldScroll() {
        return this.isNearEdge && this.isScrollable && !(this.isFullVisible && this.hasItemMoveSpace)
    }
}

export type ScrollDeltaFunctionType = ({state}: { state: ParentState }) => number

export interface Period {
    startTime: number,
    stopFlag: boolean,
    state: ParentState,
}

// Fixme 是否有更好的设计模式？
// Fixme 能否停止时有缓冲，而不是硬着陆？
export class Scroller extends EventEmitter {
    currentParentState = new ParentState({})
    scrollPeriods: Period[] = []
    scrollDeltaFunction

    static defaultScrollDeltaFunction({state}: { state: ParentState }) {
        const alpha = 3
        const {value, direction} = state.itemIntersectState
        const edge = value * direction
        const [a1, b1, a2, b2] = [-20, 1, -100, 10]
        const k = (b1 - b2) / (a1 - a2)
        const b = b1 - k * a1
        let beta
        if (edge > a1) {
            beta = b1
        } else if (edge < a2) {
            beta = b2
        } else {
            beta = k * edge + b
        }
        // console.log('calculate', edge, alpha, beta, direction)
        return alpha * beta * direction
    }

    constructor({scrollSpeed}: { scrollSpeed?: ScrollDeltaFunctionType }) {
        super()
        this.scrollDeltaFunction = this.getScrollDeltaFunction(scrollSpeed)
    }

    // TODO 优化参数配置
    getScrollDeltaFunction(prop: ScrollDeltaFunctionType | void) {
        if (prop instanceof Function) return prop
        return Scroller.defaultScrollDeltaFunction
    }

    updateParentState(newState: ParentState) {
        const oldState = this.currentParentState
        this.currentParentState = newState
        const newIsNearEdge = newState.isNearEdge
        const oldIsNearEdge = oldState.isNearEdge
        const oldShouldScroll = oldState.shouldScroll
        const newShouldScroll = newState.shouldScroll
        // console.log('updateState', newState)
        if (!oldIsNearEdge && newIsNearEdge) {
            const payload: EnterViewportEdgeEvent = {
                state: newState,
            }
            this.emit('enterViewportEdge', payload)
        }
        if (oldIsNearEdge && !newIsNearEdge) {
            const payload: LeaveViewportEdgeEvent = {
                state: newState,
            }
            this.emit('leaveViewportEdge', payload)
        }

        // TODO 需要更多滚动状态指示事件
        if (!oldShouldScroll && newShouldScroll) {
            // console.log('startScroll', newState)
            this.startScroll(newState)
        } else if (oldShouldScroll && !newShouldScroll) {
            // console.log('stop this scroll', newState)
            this.stopScroll(oldState)
        } else if (oldShouldScroll && newShouldScroll) {
            if (this.isSamePeriod(newState, oldState)) {
                // do nothing
            } else {
                // console.log('stop & startScroll', newState)
                this.stopScroll(oldState)
                this.startScroll(newState)
            }
        } else {
            // no scroll
        }
    }

    isSamePeriod(s1: ParentState, s2: ParentState) {
        return !!s1.scrollState.el && !!s2.scrollState.el &&
            s1.scrollState.el === s2.scrollState.el &&
            s1.itemIntersectState.direction === s2.itemIntersectState.direction
    }

    stopScroll(state: ParentState) {
        const period = this.scrollPeriods.find(p => this.isSamePeriod(p.state, state))
        // if (period) {
        //     console.log('stopScroll', period, state)
        // }
        // else {
        //     console.log('stopScroll error', state)
        // }

        if (period) {
            period.stopFlag = true
            const payload: ProgrammingScrollEndEvent = {
                startTime: period.startTime,
                endTime: Date.now(),
                endState: state, // Fixme 有可能是个全空的，此时要用上次的state
                startState: period.state,
            }
            this.emit('programmingScrollEnd', payload)
            this.scrollPeriods = this.scrollPeriods.filter(p => p !== period)
        }
    }

    startScroll(startState: ParentState) {
        if (!startState.shouldScroll) return
        if (this.scrollPeriods.some(p => this.isSamePeriod(p.state, startState))) return

        const startTime = Date.now()
        const period = {
            startTime,
            stopFlag: false,
            state: startState,
        } as Period
        this.scrollPeriods.push(period)
        const payload: ProgrammingScrollStartEvent = {
            startTime,
            state: startState,
        }
        this.emit('programmingScrollStart', payload)
        const scroll = () => {
            const state = this.currentParentState
            if (period.stopFlag) return false
            const el = state.scrollState.el
            const scrollDelta = this.scrollDeltaFunction({
                // startTime,
                // startState,
                state,
            })
            // console.log('scroll', scrollDelta, state)
            if (isNaN(scrollDelta) || typeof scrollDelta !== 'number') {
                // console.log('scrollError', this.periods.find(p => p === period))
                // Fixme 容错机制，停止机制
                const payload: ProgrammingScrollErrorEvent = {
                    startTime,
                    state,
                    scrollDelta,
                }
                this.emit('programmingScrollError', payload)
                this.stopScroll(state)
                return false
            }
            const target = elementIsWindow(el) ? window : el as (HTMLElement | Window)
            const {orientation, scrollSize, scrollOffset} = state.scrollState
            const newScrollOffset = Math.min(scrollOffset + scrollDelta, scrollSize)
            // console.log('scroll', newScrollOffset)
            if (orientation === 'X') {
                target.scrollTo({left: newScrollOffset})
            } else {
                target.scrollTo({top: newScrollOffset})
            }
            const payload: ProgrammingScrollEvent = {
                startTime,
                state,
                scrollDelta,
                offset: newScrollOffset,
            }
            this.emit('programmingScroll', payload)
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

    clearScrollPeriods() {
        // console.log('clear', this.periods)
        this.scrollPeriods.forEach(p => {
            p.stopFlag = true
            const payload: ProgrammingScrollEndEvent = {
                startTime: p.startTime,
                endTime: Date.now(),
                endState: new ParentState({}),
                startState: p.state,
            }
            this.emit('programmingScrollEnd', payload)
        })
        this.scrollPeriods = []
        this.currentParentState = new ParentState({})
    }
}

// TODO 深入考虑滚动的判断依据
function isElementScrollable(el: HTMLElement, orientation: string) {
    // const scrollSize = this.size(el.scrollWidth, el.scrollHeight)
    const isRoot = el === document.documentElement
    // const clientSize = isRoot
    //     ? this.size(window.innerWidth, window.innerHeight)
    //     : this.size(el.clientWidth, el.clientHeight)

    const style = window.getComputedStyle(el)
    const overflow = style['overflow' + orientation.toUpperCase() as 'overflowX' | 'overflowY']

    const scrollable = overflow === 'scroll' || overflow === 'auto' || (isRoot && overflow !== 'hidden')

    return {
        // isScrollable: scrollSize > clientSize && scrollable,
        isScrollable: scrollable,
        style,
    }
}

function elementIsWindow(el: HTMLElement | Window | void) {
    return el === document.documentElement || el === window
}

function getScrollableParents(el: HTMLElement, orientation: string) {
    let list = []

    while (el.parentElement) {
        el = el.parentElement
        const {isScrollable, style} = isElementScrollable(el, orientation)

        if (isScrollable) {
            list.push(el)
        }
        if (style.position === 'fixed') {
            break
        }
    }
    return list
}

function translateRect(r: DOMRectReadOnly, dX: number, dY: number) {
    // console.log('translateRect', r, dX, dY)
    return DOMRectReadOnly.fromRect({
        // top: r.top + dY,
        // left: r.left + dX,
        // bottom: r.bottom + dY,
        // right: r.right + dX,
        x: r.left + dX,
        y: r.top + dY,
        width: r.width,
        height: r.height,
    })
}

function moveList<T>(list: T[], fromStart: number, fromEnd: number, to: number) {
    list = [...list]
    if (
        fromStart >= 0 && fromStart < list.length &&
        fromEnd >= 0 && fromEnd < list.length &&
        to >= 0 && to < list.length
    ) {

        // insertIndex是真正插入的地方
        let insertIndex = to
        const targets = list.slice(fromStart, fromEnd + 1)
        // console.log('splice', insertIndex)
        list.splice(fromStart, targets.length)
        list.splice(insertIndex, 0, ...targets)
    }
    // console.log('move', fromStart, fromEnd, to, list)
    return list
}

export type ContainerEventName =
    'enterViewportEdge' |
    'leaveViewportEdge' |
    'enterContainerEdge' |
    'leaveContainerEdge' |

    'programmingScrollStart' |
    'programmingScrollEnd' |
    'programmingScrollError' |
    'programmingScroll' |

    'beforeDragStart' |
    'dragStart' |
    'dragOver' |
    'dragCross' |
    'beforeDrop' |
    'drop' |
    'dragEnd' |
    'orderChange' |
    string |
    symbol

// position event
export interface EnterViewportEdgeEvent {
    state: ParentState
}

export interface LeaveViewportEdgeEvent {
    state: ParentState
}

export interface EnterContainerEdgeEvent {
    intersectState: IntersectState
}

export interface LeaveContainerEdgeEvent {
    intersectState: IntersectState
}

// scroll
export interface ProgrammingScrollStartEvent {
    startTime: number,
    state: ParentState
}

export interface ProgrammingScrollEndEvent {
    startTime: number,
    endTime: number,
    endState: ParentState,
    startState: ParentState
}

export interface ProgrammingScrollErrorEvent {
    startTime: number,
    state: ParentState,
    scrollDelta: number
}

export interface ProgrammingScrollEvent {
    startTime: number,
    state: ParentState,
    scrollDelta: number,
    offset: number
}


// lifestyle
export interface BeforeDragStartEvent {
    index: number,
    cancel: () => void
}

export interface DragStartEvent {
    index: number,
}

export interface DragOverEvent {
    index: number
}

export interface DragCrossEvent {
    order: number[],
    from: number,
    group: MoveGroup,
    current: number,
    oldCurrent: number,
}

export interface BeforeDropEvent {
    index: number
}

export interface DropEvent {
    index: number
}

export interface DragEndEvent {
    index: number
}

export interface OrderChangeEvent {
    order: number[],
    from: number,
    group: MoveGroup,
    to: number,
}

// export type ContainerEventHandler = (event: ContainerEvent) => void
export type PlaceholderFunctionType = () => HTMLElement
export type MoveGroup = [number, number]

export interface DragDropProps {
    container: HTMLElement,
    // viewport,
    vertical?: boolean,
    groups?: MoveGroup[],
    transitionDuration?: number,
    placeholder?: HTMLElement | PlaceholderFunctionType,
    scrollSpeed?: ScrollDeltaFunctionType,
    scrollThreshold?: number,
    lockCrossAxis?: boolean,
    lockArea?: boolean,
    startDelay?: number,
    touchStartDelay?: number,
    startOffsetTolerate?: number,
    name?: string,
    inactiveClass?: string,
    startActiveClass?: string,
    dragActiveClass?: string,
    dropActiveClass?: string,
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
        NOT_DRAGGABLE_ELEMENT: 3,
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
    groups
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

    _children: HTMLElement[] = []
    innerOrder: number[] = []
    orderedRects: DOMRectReadOnly[] = []
    orderedSizeSums: number[] = []

    placeholderElement: HTMLElement | void = undefined
    scrollableParents: HTMLElement[] = []
    scrollableParentRects: DOMRectReadOnly[] = []

    _dropTimeout: ReturnType<typeof setTimeout> | null = null
    _dragCancelFlag = false

    startIndex = NaN
    startGroup: MoveGroup = [NaN, NaN]
    startOffsetX = NaN
    startOffsetY = NaN
    startClientX = NaN
    startClientY = NaN
    startContainerRect: DOMRectReadOnly | undefined = undefined

    currentIndex = NaN
    currentGroup: MoveGroup = [NaN, NaN]
    currentOffsetX = NaN
    currentOffsetY = NaN
    currentClientX = NaN
    currentClientY = NaN
    currentContainerRect: DOMRectReadOnly | undefined = undefined

    endClientX = NaN
    endClientY = NaN
    endOffsetY = NaN
    endOffsetX = NaN
    endIndex = NaN
    endGroup: MoveGroup = [NaN, NaN]
    endContainerRect: DOMRectReadOnly | undefined = undefined

    containerIntersectState = new IntersectState({})

    static defaultPlaceholder() {
        return document.createElement('div')
    }

    constructor({
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
        touchStartDelay = 200,
        startOffsetTolerate = 5,
        name = '',
        inactiveClass = '',
        startActiveClass = '',
        dragActiveClass = '',
        dropActiveClass = '',
        groups = [],
    }: DragDropProps) {
        super({scrollSpeed})
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
        this.groups = groups
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
        this.container.classList.add(CONTAINER_CLASS)
        this.container.classList.add(this.vertical ? VERTICAL_CONTAINER_CLASS : HORIZONTAL_CONTAINER_CLASS);
        ([...this.container.children] as HTMLElement[])
            .filter(this.isElementDraggable)
            .forEach(el => {
                el.classList.add(...this.dragInactiveClassList)
            })
    }

    _mergeClassList(suffix: string, customList: string | string[]) {
        const defaultClass = `${this.name || 'l'}-${suffix}`
        customList = Array.isArray(customList) ? customList : customList.split(' ').filter(v => !!v)
        return [defaultClass, ...customList]
    }

    get dragInactiveClassList() {
        return this._mergeClassList('inactive', this.inactiveClass)
    }

    get startActiveClassList() {
        return this._mergeClassList('start-active', this.startActiveClass)
    }

    get dragActiveClassList() {
        return this._mergeClassList('drag-active', this.dragActiveClass)
    }

    get dropActiveClassList() {
        return this._mergeClassList('drop-active', this.dropActiveClass)
    }

    isElementDraggable(el: HTMLElement) {
        return el.classList.contains(DRAGGABLE_CLASS)
    }

    // functional
    displacement(x1: number, y1: number, x2: number, y2: number) {
        return this.size(x1, y1) - this.size(x2, y2)
    }

    crossDisplacement(x1: number, y1: number, x2: number, y2: number) {
        return this.crossAxisSize(x1, y1) - this.crossAxisSize(x2, y2)
    }

    crossAxisDisplacement(x1: number, y1: number, x2: number, y2: number) {
        return this.crossAxisSize(x1, y1) - this.crossAxisSize(x2, y2)
    }

    size(x: any, y: any) {
        return this.vertical ? y : x
    }

    crossAxisSize(x: any, y: any) {
        return this.vertical ? x : y
    }

    inRect(x: number, y: number, rect: DOMRectReadOnly) {
        const point = this.size(x, y)
        const start = this.size(rect.left, rect.top)
        const end = this.size(rect.right, rect.bottom)
        // console.log('inRect', point >= start && start <= end, point, start, end)
        return point >= start && point <= end
    }

    // getters
    get orientation() {
        return this.vertical ? 'Y' : 'X'
    }

    get crossOrientation() {
        return this.vertical ? 'X' : 'Y'
    }

    get children() {
        return this._children
    }

    get isDragInactive() {
        return this._status === DragDrop.INACTIVE
    }

    get isDragStartActive() {
        return this._status === DragDrop.DRAG_START_ACTIVE
    }

    get isDragging() {
        return this._status === DragDrop.DRAGGING
    }

    get isDropActive() {
        return this._status === DragDrop.DROP_ACTIVE
    }

    get isDragStarted() {
        return this._status >= DragDrop.DRAGGING
    }

    get startElement() {
        return this.children[this.startIndex]
    }

    get startRect() {
        return this.orderedRects[this.startIndex]
    }

    get currentItemRect() {
        const s = this.startRect
        if (!s) return
        return translateRect(s, this.currentClientX - this.startClientX, this.currentClientY - this.startClientY)
    }

    setGroups(groups: MoveGroup[]) {
        this.groups = groups
    }

    // dom action
    blurActiveElement() {
        if (
            document.activeElement &&
            document.activeElement.tagName.toLowerCase() !== 'body'
        ) {
            const el = document.activeElement
            if (el instanceof HTMLElement) {
                el.blur()
            }

        }
    }

    updateScrollableParents() {
        this.scrollableParents = getScrollableParents(this.container, this.orientation)
    }

    updateScrollableParentRects() {
        this.scrollableParentRects = this.scrollableParents.map(el => {
            if (elementIsWindow(el)) {
                return DOMRectReadOnly.fromRect({
                    x: 0,
                    y: 0,
                    width: window.innerWidth,
                    height: window.innerHeight,
                })
            } else {
                return el.getBoundingClientRect()
            }
        })
    }

    isEventTargetDraggable(e: Event) {
        // console.log(e)
        let isDraggable = false
        const paths = e.composedPath()
        for (let el of paths) {
            if (!(el instanceof HTMLElement)) continue
            if (el === this.container) break
            if (el.classList.contains(HANDLER_CLASS)) {
                isDraggable = true
            }
            if (el.classList.contains(DISABLED_CLASS)) {
                isDraggable = false
                break
            }
        }
        // console.log(e, paths)
        // console.log('check', isDraggable)
        return isDraggable
    }

    // register dom listener
    // TODO 代码整理优化
    // Fixme 考虑如何禁止某些element的拖拽
    bindMouseDragStartListeners() {
        const mousedown = (e: MouseEvent) => {
            if (+e.button !== 0) return
            // console.log('mousedown event', this._status, this.isDragStarted, this.isDragStartActive)
            if (this.isDragStarted || this.isDragStartActive) return
            if (!this.isEventTargetDraggable(e)) return
            e.preventDefault()
            e.stopPropagation()
            const payload = {
                clientX: e.clientX,
                clientY: e.clientY,
                event: e,
            }
            if (this.startDelay) {
                this.delayMouseDragStart(payload)
            } else {
                let mouseOverCount = 0
                const mousemove = (e: MouseEvent) => {
                    // console.log('mouseOver', e)
                    e.preventDefault()
                    mouseOverCount += 1
                    if (mouseOverCount >= 1) {
                        this.container.removeEventListener('mousemove', mousemove)
                        this.container.removeEventListener('mouseup', mouseup)
                        const payload = {
                            clientX: e.clientX,
                            clientY: e.clientY,
                            event: e,
                        }
                        this.blurActiveElement()
                        this.bindMouseLifecycleListeners()
                        this.pressStart(payload)
                        this.beforeDragStart(payload)
                        this.dragStart(payload)
                    }
                }
                const mouseup = () => {
                    this.container.removeEventListener('mousemove', mousemove)
                }
                this.container.addEventListener('mouseup', mouseup, {passive: true, once: true})
                this.container.addEventListener('mousemove', mousemove)
                // e.preventDefault()
                // e.stopPropagation()
            }
        }
        this.container.addEventListener('mousedown', mousedown)
    }

    bindEnvironmentListeners() {
        // scroll
        const scroll = (e: Event) => {
            window.requestAnimationFrame(() => {
                if (!this.isDragStarted) return
                this.moveContainer(e)
            })
        }

        const scrollTargets = this.scrollableParents.map(el => {
            return el === document.documentElement ? window : el
        })

        // resize
        const resize = (e: Event) => {
            window.requestAnimationFrame(() => {
                if (!this.isDragStarted) return
                this.resizeContainer(e)
            })
        }
        scrollTargets.forEach(t => {
            t.addEventListener('scroll', scroll, {passive: true})
        })
        window.addEventListener('resize', resize, {passive: true})
        this.once('dragEnd', () => {
            window.removeEventListener('resize', resize)
            scrollTargets.forEach(t => {
                t.removeEventListener('scroll', scroll)
            })
        })
    }

    delayMouseDragStart({clientX, clientY, event}: { clientX: number, clientY: number, event: MouseEvent }) {
        let endX = clientX
        let endY = clientY
        let pid: ReturnType<typeof setTimeout>
        let startRect = this.container.getBoundingClientRect()
        let endRect = startRect
        const tolerate = this.startOffsetTolerate
        const scrollableParents = getScrollableParents(this.container, this.orientation)
        const events = [
            {target: window, type: 'mousemove'},
            {target: window, type: 'resize'},
            ...scrollableParents.map(s => ({target: s, type: 'scroll'})),
        ]
        const onMove = (e: Event) => {
            window.requestAnimationFrame(() => {
                if (e instanceof MouseEvent) {
                    endX = e.clientX
                    endY = e.clientY
                } else {
                    endRect = this.container.getBoundingClientRect()
                }
                const dX = endX - clientX + startRect.left - endRect.left
                const dY = endY - clientY + startRect.top - endRect.top
                if (
                    Math.abs(dX) > tolerate || Math.abs(dY) > tolerate
                ) {
                    window.removeEventListener('mouseup', mouseup)
                    events.forEach(({target, type}) => {
                        target.removeEventListener(type, onMove)
                    })
                    clearTimeout(pid)
                    this.dragCanceled({
                        clientX,
                        clientY,
                        event,
                        type: DragDrop.CANCEL_REASON.EXCEED_OFFSET_LIMIT,
                    })
                    // console.log('move exceed limit')
                }
            })
        }
        const mouseup = () => {
            events.forEach(({target, type}) => {
                target.removeEventListener(type, onMove)
            })
            clearTimeout(pid)
            this.dragCanceled({
                clientX,
                clientY,
                event,
                type: DragDrop.CANCEL_REASON.END_BEFORE_DELAY,
            })
            // console.log('mouseup before delay')
        }

        pid = setTimeout(() => {
            window.removeEventListener('mouseup', mouseup)
            events.forEach(({target, type}) => {
                target.removeEventListener(type, onMove)
            })
            this.blurActiveElement()
            this.bindMouseLifecycleListeners()
            this.beforeDragStart({clientX: endX, clientY: endY})
            this.dragStart({clientX: endX, clientY: endY, event})
        }, this.startDelay)

        // console.log('start count')
        this.pressStart({clientX, clientY, event})
        events.forEach(({target, type}) => {
            target.addEventListener(type, onMove, {passive: true})
        })
        window.addEventListener('mouseup', mouseup, {once: true})
    }

    bindMouseLifecycleListeners() {
        // dragover
        const dragOver = (e: MouseEvent) => {
            // trigger by touch
            if (!e.movementX && !e.movementY) return
            window.requestAnimationFrame(() => {
                if (!this.isDragging) return
                this.moveTarget(e)
            })
        }
        window.addEventListener('mousemove', dragOver, {passive: true})

        // drop
        window.addEventListener('mouseup', e => {
            // e.preventDefault()
            // e.stopPropagation()
            window.removeEventListener('mousemove', dragOver)
            this.beforeDrop({clientX: e.clientX, clientY: e.clientY})
            this.drop({clientX: e.clientX, clientY: e.clientY})
        }, {once: true})
    }

    bindTouchDragStartListeners() {
        this.container.addEventListener('touchstart', e => {
            // console.log('touchstart event', e, index)
            if (this.isDragStarted || this.isDragStartActive) return
            if (!this.isEventTargetDraggable(e)) return
            if (e.cancelable) {
                e.preventDefault()
            }
            e.stopPropagation()
            const rect = this.container.getBoundingClientRect()
            const touch = [...e.touches].find(t => {
                const {clientX: x, clientY: y} = t
                return x >= rect.left && x <= rect.right &&
                    y >= rect.top && y <= rect.bottom
            })
            if (!touch) return

            const payload = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                event: e,
                touchId: touch.identifier,
            }
            if (this.startDelay || this.touchStartDelay) {
                this.delayTouchDragStart(payload)
            } else {
                // if (e.cancelable) e.preventDefault()
                // e.stopPropagation()
                this.blurActiveElement()
                this.bindTouchLifecycleListeners(touch.identifier)
                this.pressStart(payload)
                this.beforeDragStart(payload)
                this.dragStart(payload)
            }
        })
    }

    delayTouchDragStart({
        clientX,
        clientY,
        event,
        touchId,
    }: { clientX: number, clientY: number, event: TouchEvent, touchId: number }) {
        const delayMs = this.touchStartDelay || this.startDelay
        let endX = clientX
        let endY = clientY
        let pid: ReturnType<typeof setTimeout>
        let startRect = this.container.getBoundingClientRect()
        let endRect = startRect
        const tolerate = this.startOffsetTolerate
        const scrollableParents = getScrollableParents(this.container, this.orientation)
        const events = [
            {target: window, type: 'touchmove'},
            {target: window, type: 'resize'},
            ...scrollableParents.map(s => ({target: s, type: 'scroll'})),
        ]

        const onMove = (e: TouchEvent) => {
            window.requestAnimationFrame(() => {
                if (e instanceof TouchEvent) {
                    const touch = [...e.touches].find(t => t.identifier === touchId)
                    if (!touch) return
                    endX = touch.clientX
                    endY = touch.clientY
                } else {
                    endRect = this.container.getBoundingClientRect()
                }
                const dX = endX - clientX + startRect.left - endRect.left
                const dY = endY - clientY + startRect.top - endRect.top
                if (
                    Math.abs(dX) > tolerate || Math.abs(dY) > tolerate
                ) {
                    window.removeEventListener('touchend', touchend)
                    events.forEach(({target, type}) => {
                        target.removeEventListener(type, onMove as EventListenerOrEventListenerObject)
                    })
                    clearTimeout(pid)
                    this.dragCanceled({
                        clientX,
                        clientY,
                        event,
                        type: DragDrop.CANCEL_REASON.EXCEED_OFFSET_LIMIT,
                    })
                    // console.log('move exceed limit')
                }
            })
        }
        const touchend = (e: TouchEvent) => {
            if (e.cancelable) {
                e.preventDefault()
            }
            events.forEach(({target, type}) => {
                target.removeEventListener(type, onMove as EventListenerOrEventListenerObject)
            })
            clearTimeout(pid)
            this.dragCanceled({
                clientX,
                clientY,
                event,
                type: DragDrop.CANCEL_REASON.END_BEFORE_DELAY,
            })
            // console.log('touched before delay')
        }

        pid = setTimeout(() => {
            window.removeEventListener('touchend', touchend)
            events.forEach(({target, type}) => {
                target.removeEventListener(type, onMove as EventListenerOrEventListenerObject)
            })
            this.blurActiveElement()
            this.bindTouchLifecycleListeners(touchId)
            this.beforeDragStart({clientX: endX, clientY: endY})
            this.dragStart({clientX: endX, clientY: endY, event})
        }, delayMs)
        // console.log('start count')
        this.pressStart({clientX, clientY, event})
        events.forEach(({target, type}) => {
            target.addEventListener(type, onMove as EventListenerOrEventListenerObject, {passive: true})
        })
        window.addEventListener('touchend', touchend, {once: true})
    }

    bindTouchLifecycleListeners(touchId: number) {
        // dragover
        const dragOver = (e: TouchEvent) => {
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
                        clientY: touch.clientY,
                    })
                })
            }
        }
        window.addEventListener('touchmove', dragOver, {passive: false})

        // drop
        const touchend = (e: TouchEvent) => {
            // if (e.cancelable) {
            //     e.preventDefault()
            // }
            // e.stopPropagation()
            window.removeEventListener('touchmove', dragOver)
            const touch = [...e.changedTouches].find(t => t.identifier === touchId)
            // console.log('touchend', e)
            if (touch) {
                this.beforeDrop({
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                })
                this.drop({
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                })
                window.removeEventListener('touchend', touchend)
            }
        }
        window.addEventListener('touchend', touchend)
    }

    updateStatus(status: number) {
        this._status = status
    }

    updateChildren() {
        this._children = [...this.container.children] as HTMLElement[]
        this.innerOrder = this.children.map((c, i) => i)
    }

    updateInnerOrder() {
        let list = [...this.innerOrder]
        const children = this.children
        if (list.length !== children.length) {
            list = children.map((c, i) => i)
            this.innerOrder = list
        } else if (
            !isNaN(this.startIndex) &&
            !isNaN(this.currentIndex) &&
            this.startIndex !== this.currentIndex
        ) {
            const [gs, ge, to] = [this.startGroup[0], this.startGroup[1], this.currentIndex]
            this.innerOrder = moveList(list, gs, ge, to)
        }
    }

    updateOrderedRects() {
        this.orderedRects = this.children
            // get boxes
            .map((el) => el.getBoundingClientRect())
            // ordered
            .map((box, i, rects) => rects[this.innerOrder[i]])
        const list: number[] = []
        this.orderedRects.reduce((t, a) => {
            const sum = t + this.size(a.width, a.height)
            list.push(sum)
            return sum
        }, 0)
        this.orderedSizeSums = list
        // console.log('get', list)
    }

    getRectMergeSize(start: number, to: number): [width: number, height: number] {
        let height = 0
        let width = 0
        for (let i = start; i <= to; ++i) {
            if (this.vertical) {
                height += this.orderedRects[i].height
                width = Math.max(width, this.orderedRects[i].width)
            } else {
                height = Math.max(height, this.orderedRects[i].height)
                width += this.orderedRects[i].width
            }
        }
        return [width, height]
    }

    makePlaceholder() {
        const placeholder = this.placeholder instanceof Function ? this.placeholder() : this.placeholder
        placeholder.classList.add(PLACEHOLDER_CLASS)

        const s = placeholder.style
        const [width, height] = this.getRectMergeSize(...this.startGroup)
        s.minHeight = height + 'px'
        s.maxHeight = height + 'px'
        s.minWidth = width + 'px'
        s.maxWidth = width + 'px'
        // console.log('placeholder', this.orderedRects)
        // console.log('placeholder style', height, width)
        this.placeholderElement = placeholder
    }

    setDragOverStaticStyle() {
        this.children.forEach((el, i) => {
            const s = el.style
            // 与是否Draggable无关
            if (i >= this.startGroup[0] && i <= this.startGroup[1]) {
                s.zIndex = '2'
                s.position = 'fixed'
                const {top, left, height, width} = this.orderedRects[i]
                s.top = top + 'px'
                s.left = left + 'px'
                s.height = height + 'px'
                s.width = width + 'px'
                s.transitionDuration = '0'
                s.transitionTimingFunction = ''
                s.transitionProperty = ''
                s.pointerEvents = 'none'
                s.transform = ''
            } else {
                s.zIndex = '1'
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
            ps.zIndex = '0'
            ps.transitionProperty = 'all'
            // const size = this.size(this.state.offsetWidth, this.state.offsetHeight)
            // TODO 动态计算移动持续时间
            ps.transitionDuration = `150ms`
        }
    }

    getCrossedBoxDisplacement() {
        const start = this.startIndex
        let to = isNaN(this.endIndex) ? this.currentIndex : this.endIndex
        if (isNaN(to)) return NaN
        return (start < to ? 1 : -1) * this.orderedRects
            .filter((box, i) => {
                return (i > start && i <= to) || (i < start && i >= to)
            })
            .reduce((t, box) => t + this.size(box.width, box.height), 0)
    }

    setDropStyle() {
        const children = this.children
        if (!children[this.startIndex]) return

        const boxDisplacement = this.getCrossedBoxDisplacement()
        const scRect = this.startContainerRect as DOMRectReadOnly
        const ecRect = this.endContainerRect as DOMRectReadOnly
        const containerDelta = this.displacement(
            ecRect.left,
            ecRect.top,
            scRect.left,
            scRect.top,
        )
        const dragEndDisplacement = boxDisplacement + containerDelta
        // console.log('drop', boxDisplacement, containerDelta)
        // console.log('setDrop', `translate${this.orientation}(${dragEndDisplacement}px)`)
        let dX = 0
        let dY = 0
        this.vertical ? dY += dragEndDisplacement : dX += dragEndDisplacement
        for (let i = this.startGroup[0]; i <= this.startGroup[1]; ++i) {
            const s = children[i].style
            s.transitionTimingFunction = 'ease'
            s.transitionProperty = 'all'
            // Fixme 动态配置
            s.transitionDuration = `${this.transitionDuration}ms`
            s.left = this.orderedRects[i].left + dX + 'px'
            s.top = this.orderedRects[i].top + dY + 'px'
        }
    }

    setStartState(props: { startClientX: number, startClientY: number }) {
        this.startClientX = props.startClientX
        this.startClientY = props.startClientY
        this.startContainerRect = this.container.getBoundingClientRect()
        this.startOffsetX = this.startClientX - this.startContainerRect.left
        this.startOffsetY = this.startClientY - this.startContainerRect.top

        // this.startIndex = this.orderedRects.findIndex(rect => this.inRect(this.startClientX, this.startClientY, rect))
        const d = this.size(this.startOffsetX, this.startOffsetY)
        let index = binarySearch(this.orderedSizeSums, d, {exact: false})
        this.startIndex = index
        // console.log('findStartIndex', this.orderedSizeSums, d, index)

        if (this.startIndex == null || this.startIndex < 0 || this.startIndex >= this.orderedRects.length) {
            throw Error(`[LegatoDnD] start position out of boundary: (${this.startClientX}, ${this.startClientY})`)
        }
        const g = this.groups.find(g => g[0] === this.startIndex)
        if (g && g[0] >= 0 && g[1] < this.orderedRects.length) {
            this.startGroup = [...g]
        } else {
            this.startGroup = [this.startIndex, this.startIndex]
        }

        // this.currentClientX = this.startClientX
        // this.currentClientY = this.startClientY
        // this.currentOffsetX = this.startOffsetX
        // this.currentOffsetY = this.startOffsetY
        // this.currentIndex = this.startIndex
        // this.currentContainerRect = this.startContainerRect
    }

    updateCurrentIndex() {
        // const d = this.displacement(
        //     this.currentOffsetX,
        //     this.currentOffsetY,
        //     this.startOffsetX,
        //     this.startOffsetY,
        // )
        //
        // const boxes = this.orderedRects
        // const absD = Math.abs(d)
        // let p = this.startIndex
        // let sum = 0
        // // TODO 使用二分查找
        // /* eslint-disable */
        // while ((d > 0 && p < boxes.length - 1) || (d < 0 && p > 0)) {
        //     const nextBox = boxes[d > 0 ? p + 1 : p - 1]
        //     const size = this.size(nextBox.width, nextBox.height)
        //     const threshold = size * 0.5
        //     if (sum + size < absD) {
        //         sum += size
        //         p += d > 0 ? 1 : -1
        //         continue
        //     }
        //     if (sum + threshold <= absD) {
        //         p += d > 0 ? 1 : -1
        //         break
        //     }
        //     break
        // }
        //
        // // gs === startIndex
        // const [gs, ge] = this.startGroup
        // if (gs !== ge && p > gs && p <= ge) {
        //     p = gs
        // }
        const d = this.displacement(
            this.currentOffsetX,
            this.currentOffsetY,
            this.startOffsetX,
            this.startOffsetY,
        )
        const sums = this.orderedSizeSums
        const targetSize = this.size(...this.getRectMergeSize(...this.startGroup))
        const headOffset = this.displacement(
            this.startRect.left,
            this.startRect.top,
            this.startContainerRect!.left,
            this.startContainerRect!.top,
        ) + d
        const offset = d > 0 ? headOffset + targetSize : headOffset
        let p = binarySearch(sums, offset, {exact: false})
        p = Math.max(Math.min(p, sums.length - 1), 0)
        const overSize = d > 0
            ? offset - (sums[p - 1] || 0)
            : sums[p] - offset

        // console.log('after bs', p, offset, sums)
        const [gs, ge] = this.startGroup
        // if (gs !== ge && p > gs && p <= ge) {
        //     // p = gs
        // } else {
        //
        // }
        const threshold = 0.5
        const pRect = this.orderedRects[p]
        const pSize = this.size(pRect.width, pRect.height)
        if (overSize < pSize * threshold) {
            p -= d > 0 ? 1 : -1
        }

        p = d > 0 ? p - (ge - gs) : p
        // console.log('updateCurrent', p, overSize < pSize * threshold, overSize, pSize)

        // must valid (0 <= p <= length)
        this.currentIndex = p
    }

    // Fixme 超大物体，体验不好，移动端，设置为0体验不好，横向滚动，移动端，体验不好
    getParentState() {
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
                orientation: this.orientation,
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
            orientation: this.orientation,
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
                orientation: this.orientation,
            })
            if (!s.isToEnd(iiState.direction)) {
                scrollState = s
                break
            }
        }

        return new ParentState({
            itemIntersectState: iiState,
            containerIntersectState,
            scrollState,
        })
    }

    updateOtherItemPosition() {
        this.children.forEach((el, i) => {
            let s = el.style
            const [gs, ge, to] = [this.startGroup[0], this.startGroup[1], this.currentIndex]
            if (i >= gs && i <= ge) return
            const targetSize = this.size(...this.getRectMergeSize(...this.startGroup))
            let value
            if ((i > ge && i <= ge - gs + to) || (i >= to && i < gs)) {
                value = gs < to ? -targetSize : targetSize
            } else {
                value = 0
            }
            // console.log('value', i, value)
            s.transform = `translate${this.orientation}(${value}px)`
        })
    }

    updateTargetPosition() {
        const children = this.children
        if (!children[this.startIndex]) return
        let dX = this.currentClientX - this.startClientX
        let dY = this.currentClientY - this.startClientY
        if (this.lockArea || this.lockCrossAxis) {
            this.vertical ? dX = 0 : dY = 0
        }
        for (let i = this.startGroup[0]; i <= this.startGroup[1]; ++i) {
            const s = children[i].style
            s.left = this.orderedRects[i].left + dX + 'px'
            s.top = this.orderedRects[i].top + dY + 'px'
        }
    }

    updatePlaceholderPosition() {
        if (!this.placeholderElement) return
        const style = this.placeholderElement.style
        const boxDisplacement = this.getCrossedBoxDisplacement()
        style.transform = `translate${this.orientation}(${boxDisplacement}px)`
    }

    setCurrentState(props: { currentClientX: number, currentClientY: number, currentContainerRect: DOMRectReadOnly }) {
        let isIndexChange = false
        this.currentClientX = props.currentClientX
        this.currentClientY = props.currentClientY
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
            this.currentGroup = [this.currentIndex, this.currentIndex + this.startGroup[1] - this.startGroup[0]]
        }
        return {isIndexChange, oldCurrentIndex}
    }

    updateDraggingModel({
        currentClientX = this.currentClientX,
        currentClientY = this.currentClientY,
        currentContainerRect = this.currentContainerRect,
    }) {
        if (this.lockArea) {
            // console.log('calculate lockArea')
            const sRect = this.startRect
            // const currentItemRect = translateRect(this.startRect, currentClientX - this.startClientX, currentClientY - this.startClientY)
            const x = sRect.left + currentClientX - this.startClientX
            const y = sRect.top + currentClientY - this.startClientY
            const [width, height] = this.getRectMergeSize(...this.startGroup)
            const currentItemRect = DOMRectReadOnly.fromRect({x, y, width, height})
            const state = new IntersectState({
                root: currentContainerRect,
                target: currentItemRect,
                orientation: this.orientation,
            })
            if (state.value) {
                this.vertical ? currentClientY += state.value : currentClientX += state.value
            }
            const oldState = this.containerIntersectState
            // console.log('checkarea', this.startGroup, state.isIntersecting, currentContainerRect, currentItemRect)
            if (!oldState.isIntersecting && state.isIntersecting) {
                const payload: EnterContainerEdgeEvent = {intersectState: state}
                this.emit('enterContainerEdge', payload)
            }
            if (oldState.isIntersecting && !state.isIntersecting) {
                const payload: LeaveContainerEdgeEvent = {intersectState: state}
                this.emit('leaveContainerEdge', payload)
            }
            this.containerIntersectState = state
        }
        const {isIndexChange, oldCurrentIndex} = this.setCurrentState({
            currentClientX,
            currentClientY,
            currentContainerRect: currentContainerRect as DOMRectReadOnly,
        })
        // console.log('dragover', isStateChange, isIndexChange)

        if (isIndexChange) {
            this.updateOtherItemPosition()
            this.updatePlaceholderPosition()
            const order = moveList(this.innerOrder, this.startGroup[0], this.startGroup[1], this.currentIndex)
            const payload: DragCrossEvent = {
                from: this.startIndex,
                group: this.startGroup,
                current: this.currentIndex,
                oldCurrent: oldCurrentIndex,
                order,
            }
            this.emit('dragCross', payload)
        }
    }

    setEndState(props: { endClientY: number, endClientX: number, endContainerRect?: DOMRectReadOnly }) {
        this.endClientX = props.endClientX
        this.endClientY = props.endClientY
        if (!(props.endContainerRect instanceof DOMRectReadOnly)) {
            throw Error('[LegatoDnD] state error: endContainerRect=' + props.endContainerRect)
        }
        this.endContainerRect = props.endContainerRect
        this.endOffsetX = this.endClientX - this.endContainerRect.left
        this.endOffsetY = this.endClientY - this.endContainerRect.top
        this.endIndex = this.currentIndex
        this.endGroup = [...this.currentGroup]
    }

    alignDropPosition() {
        if (!this.scrollableParents.length) return
        // console.log('alignDropPosition')
        const boxDisplacement = this.getCrossedBoxDisplacement()
        const scRect = this.startContainerRect as DOMRectReadOnly
        const ecRect = this.endContainerRect as DOMRectReadOnly
        const containerDelta = this.displacement(
            ecRect.left,
            ecRect.top,
            scRect.left,
            scRect.top,
        )
        const dragEndDisplacement = boxDisplacement + containerDelta
        let dX = 0, dY = 0
        this.vertical ? dY += dragEndDisplacement : dX = dragEndDisplacement
        const eiRect = translateRect(this.startRect, dX, dY)

        let r = {} as { x: number, y: number, right: number, bottom: number, width: number, height: number }
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
            orientation: this.orientation,
        })
        // console.log('align', iiState)
        if (iiState.isIntersecting) {
            let scrollState
            for (let i = 0; i < this.scrollableParents.length; ++i) {
                const s = new ScrollState({
                    el: this.scrollableParents[i],
                    index: i,
                    rect: this.scrollableParentRects[i],
                    orientation: this.orientation,
                })
                if (!s.isToEnd(iiState.direction)) {
                    scrollState = s
                    break
                }
            }
            if (scrollState) {
                const target = elementIsWindow(scrollState.el) ? window : scrollState.el as HTMLElement | Window
                // Fixme 可能滚动不到（offset + delta > scrollSize）
                const value = scrollState.scrollOffset - iiState.value
                // console.log('align', value, iiState)
                if (this.vertical) {
                    target.scrollTo({top: value, behavior: 'smooth'})
                } else {
                    target.scrollTo({left: value, behavior: 'smooth'})
                }
            }
        }
    }

    updateDropModel({
        endClientX = this.endClientX,
        endClientY = this.endClientY,
        endContainerRect = this.endContainerRect,
    }) {
        this.setEndState({
            endClientX,
            endClientY,
            endContainerRect,
        })
        // console.log('positive', this.startTop + this.offsetHeight + boxDistance, sRect.bottom)
        // console.log('negative', this.startTop + boxDistance, sRect.top)
        this.setDropStyle()
        clearTimeout(this._dropTimeout as Timeout)
        this._dropTimeout = setTimeout(() => {
            this.dragEnd({
                from: this.startIndex,
                to: this.currentIndex,
            })
        }, this.transitionDuration)
    }

    clearDragState() {
        this._children = []
        this.innerOrder = []
        this.orderedRects = []
        this.orderedSizeSums = []

        this.placeholderElement = undefined
        this.scrollableParents = []
        this.scrollableParentRects = []

        this._dropTimeout = null
        this._dragCancelFlag = false

        this.startIndex = NaN
        this.startGroup = [NaN, NaN]
        this.startOffsetX = NaN
        this.startOffsetY = NaN
        this.startClientX = NaN
        this.startClientY = NaN
        this.startContainerRect = undefined

        this.currentIndex = NaN
        this.currentGroup = [NaN, NaN]
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
        this.endGroup = [NaN, NaN]
        this.endContainerRect = undefined

        this.containerIntersectState = new IntersectState({})
    }

    clearDragStyle() {
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
            'height',
        ]

        styles.forEach(key => {
            this.children.forEach(el => {
                // @ts-ignore
                el.style[key] = ''
            })
        })
    }

    clearPlaceholder() {
        [...this.container.children]
            .filter(el => el.classList.contains(PLACEHOLDER_CLASS))
            .forEach(el => {
                this.container.removeChild(el)
            })
        this.placeholderElement = undefined
    }

    pressStart(e: any) {
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

    dragCanceled(e: any) {
        if (!this.isDragStartActive) return
        this.updateStatus(DragDrop.INACTIVE)
        this._children = []
        this.innerOrder = []
        this.orderedRects = []
        this.orderedSizeSums = []
        this.scrollableParentRects = []
        this.scrollableParents = []
    }

    beforeDragStart({clientX, clientY}: { clientX: number, clientY: number }) {
        if (!this.isDragStartActive) return

        this.updateOrderedRects()
        this.updateScrollableParents()
        this.updateScrollableParentRects()

        // set state
        try {
            this.setStartState({
                startClientX: clientX,
                startClientY: clientY,
            })
            if (!this.isElementDraggable(this.startElement)) {
                this._dragCancelFlag = true
            }
            const payload: BeforeDragStartEvent = {
                index: this.startIndex,
                cancel: () => {
                    this._dragCancelFlag = true
                },
            }
            this.emit('beforeDragStart', payload)
        } catch (e) {
            this._dragCancelFlag = true
        }

    }

    // Fixme error handler
    dragStart({clientX, clientY, event}: { clientX: number, clientY: number, event: Event }) {
        if (!this.isDragStartActive) return
        if (this._dragCancelFlag) {
            // console.log('canceled')
            this.dragCanceled({
                clientX, clientY, event,
                type: DragDrop.CANCEL_REASON.NOT_DRAGGABLE_ELEMENT,
            })
            return
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
        // console.log('dragStart', this.orderedRects, this.startIndex, this.startContainerRect)
        // make placeholder
        this.makePlaceholder()
        this.setDragOverStaticStyle()
        this.startElement.after(this.placeholderElement as HTMLElement)
        // console.log('updateDragingmoidel', this.startContainerRect)
        this.updateDraggingModel({
            currentClientX: this.startClientX,
            currentClientY: this.startClientY,
            currentContainerRect: this.startContainerRect,
        })

        this.children
            .filter(this.isElementDraggable)
            .forEach(el => {
                el.classList.remove(...this.startActiveClassList)
                el.classList.add(...this.dragActiveClassList)
            })
        const payload: DragStartEvent = {
            index: this.startIndex,
        }
        this.emit('dragStart', payload)
        // console.log('onDragStart', this.startIndex)
        // console.log('scrollinit', this.startContainerRect, this.scrollableParentsRect)
    }

    dragOver(
        {currentClientX, currentClientY, currentContainerRect}
            : {
            currentClientX?: number,
            currentClientY?: number,
            currentContainerRect?: DOMRectReadOnly
        },
    ) {
        this.updateDraggingModel({
            currentClientX,
            currentClientY,
            currentContainerRect,
        })
        this.updateParentState(this.getParentState())
        const payload: DragOverEvent = {index: this.currentIndex}
        this.emit('dragOver', payload)
        // console.log('onDragOver')
    }

    beforeDrop({clientX: currentClientX, clientY: currentClientY}: { clientX: number, clientY: number }) {
        if (!this.isDragging) return
        // console.log('onDrop')
        this.updateDraggingModel({
            currentClientX,
            currentClientY,
        })
        // console.log('beforeClear')
        this.clearScrollPeriods()

        this.updateDropModel({
            endClientX: currentClientX,
            endClientY: currentClientY,
            endContainerRect: this.currentContainerRect,
            // startClientX,
            // startClientY
        })
        const payload: BeforeDropEvent = {index: this.endIndex}
        this.emit('beforeDrop', payload)
    }

    // Fixme 判断移动到minimizeParentRect外，则判定拖拽重置
    drop({clientX, clientY}: { clientX: number, clientY: number }) {
        // console.log('dropp', this.isDragging)
        if (!this.isDragging) return
        this.updateStatus(DragDrop.DROP_ACTIVE)
        this.alignDropPosition()
        this.children
            .filter(this.isElementDraggable)
            .forEach(el => {
                el.classList.remove(...this.dragActiveClassList)
                el.classList.add(...this.dropActiveClassList)
            })
        // console.log('emit drop')
        const payload: DropEvent = {
            index: this.endIndex,
        }
        this.emit('drop', payload)
    }

    dragEnd(e: any) {
        // console.log('onDragEnd')
        this.updateStatus(DragDrop.INACTIVE)
        if (this.startIndex !== this.currentIndex) {
            this.updateInnerOrder()
        }
        const order = [...this.innerOrder]
        const payload: DragEndEvent = {
            index: this.endIndex,
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

        this.emit('dragEnd', payload)
        if (this.startIndex !== this.currentIndex) {
            const payload: OrderChangeEvent = {
                from: this.startIndex,
                to: this.currentIndex,
                group: this.startGroup,
                order,
            }
            this.emit('orderChange', payload)
        }

        // console.log('dragEnd', this.innerOrder)
    }

    moveTarget({clientX, clientY}: { clientX: number, clientY: number }) {
        this.dragOver({currentClientX: clientX, currentClientY: clientY})
        this.updateTargetPosition()
    }

    moveContainer(e: Event) {
        this.updateScrollableParentRects()
        if (this.isDragging) {
            this.dragOver({
                currentContainerRect: this.container.getBoundingClientRect(),
            })
            // TODO performance improvement point
            this.updateTargetPosition()
        } else {
            // Fixme 性能问题，考虑setTimeout，debounce等方式减少setDropStyle ?
            this.updateDropModel({
                endContainerRect: this.container.getBoundingClientRect(),
            })
        }
    }

    resizeContainer(event: Event) {
        // Fixme 未测试
        this.updateScrollableParents()
        this.updateScrollableParentRects()
        this.updateOrderedRects()
        if (this.isDragging) {
            this.updateDraggingModel({currentContainerRect: this.container.getBoundingClientRect()})
            // console.log('updateDraggingModel from onContentScroll')
        } else {
            // Fixme 性能问题，考虑setTimeout，debounce等方式减少setDropStyle ?
            this.updateDropModel({
                endContainerRect: this.container.getBoundingClientRect(),
            })
        }
    }

    // TODO 考虑item变化（dom、style）
    // onItemChange () {
    // }

    onEnterViewportEdge() {
        // Fixme updateScrollableParent时，如何解除
        // console.log('onEnterViewportEdge')
        const targets = this.scrollableParents.map(el => {
            return elementIsWindow(el) ? window : el
        })
        const prevent = (e: Event) => {
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
        // console.log('addViewportEdgeListener')
        targets.forEach(t => {
            t.addEventListener('wheel', prevent, {passive: false})
            t.addEventListener('touch', prevent, {passive: false})
        })
        this.on('leaveViewportEdge', remove)
        this.on('drop', remove)
    }
}
