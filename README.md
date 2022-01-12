# Legato Dnd

Lite, fast and configurable drag & drop list.

## Basic Usage

```javascript
const el = document.getElementById('container')
for (let i = 0; i < 10; ++i) {
    let child = document.createElement('div')
    child = Legato.draggable(child)
    el.append(child)
}
const container = new Legato.DragDrop({ container: el })

```

## Container Options

props from Container, usage:

```typescript
type ScrollDeltaFunctionType = ({state}: { state: ParentState }) => number
type PlaceholderFunctionType = () => HTMLElement
type MoveGroup = [number, number]

interface DragDropProps {
    container: HTMLElement,
    vertical?: boolean, // default false
    groups?: MoveGroup[],
    transitionDuration?: number, // default 200
    placeholder?: HTMLElement | PlaceholderFunctionType,
    scrollSpeed?: ScrollDeltaFunctionType,
    scrollThreshold?: number, // default 0
    lockCrossAxis?: boolean, // default false
    lockArea?: boolean, // default false
    startDelay?: number, // default 0
    touchStartDelay?: number, // default 200
    startOffsetTolerate?: number, // default 5
    name?: string,
    inactiveClass?: string,
    startActiveClass?: string,
    dragActiveClass?: string,
    dropActiveClass?: string,
}
```

## Events

basic usage:

```typescript
const dragDrop = new DragDrop(options)
dragDrop.on('dragStart', () => {
    console.log('dragStart')
})
dragDrop.on('orderChange', ({from, to, order}) => {
    // do something
})
```

### Move Position

#### enterViewportEdge

```typescript
// position event
export interface EnterViewportEdgeEvent {
    state: ParentState
}



```

#### leaveViewportEdge

```typescript
export interface LeaveViewportEdgeEvent {
    state: ParentState
}


```

#### enterContainerEdge

```typescript
export interface EnterContainerEdgeEvent {
    intersectState: IntersectState
}




```

#### leaveContainerEdge

```typescript
export interface LeaveContainerEdgeEvent {
    intersectState: IntersectState
}
```

### Programming Scroll

#### programmingScrollStart

```typescript
// scroll
export interface ProgrammingScrollStartEvent {
    startTime: number,
    state: ParentState
}
```

#### programmingScrollEnd

```typescript
export interface ProgrammingScrollEndEvent {
    startTime: number,
    endTime: number,
    endState: ParentState,
    startState: ParentState
}


```

#### programmingScrollError

```typescript
export interface ProgrammingScrollErrorEvent {
    startTime: number,
    state: ParentState,
    scrollDelta: number
}


```

#### programmingScroll

```typescript
export interface ProgrammingScrollEvent {
    startTime: number,
    state: ParentState,
    scrollDelta: number,
    offset: number
}
```

### Drag Lifecycle

#### beforeDragStart

```typescript
// lifestyle
export interface BeforeDragStartEvent {
    index: number,
    cancel: () => void
}
```

#### dragStart

```typescript
export interface DragStartEvent {
    index: number,
}

```

#### dragOver

```typescript
export interface DragOverEvent {
    index: number
}


```

#### dragCross

```typescript
export interface DragCrossEvent {
    order: number[],
    from: number,
    group: MoveGroup,
    current: number,
    oldCurrent: number,
}


```

#### beforeDrop

```typescript
export interface BeforeDropEvent {
    index: number
}


```

#### drop

```typescript
export interface DropEvent {
    index: number
}


```

#### dragEnd

```typescript
export interface DragEndEvent {
    index: number
}


```

#### orderChange

```typescript
export interface OrderChangeEvent {
    order: number[],
    from: number,
    group: MoveGroup,
    to: number,
}
```


