# Legato Dnd

Lite, fast, Beautiful and configurable drag & drop list.

Use with frameworks:
- for Vue 2.x: [vue2-legato-dnd](https://github.com/LazyLZ/vue2-legato-dnd)
- for Vue 2.x: [vue-legato-dnd](https://github.com/LazyLZ/vue-legato-dnd)
- for React: [react-legato-dnd](https://github.com/LazyLZ/react-legato-dnd)

## Install
```shell
# npm
npm install legato-dnd

# yarn
yarn add legato-dnd
```

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
    startIndex: number,
    startGroup: MoveGroup,
    cancel: () => void
}
```

#### dragStart

```typescript
export interface DragStartEvent {
    startIndex: number,
    startGroup: MoveGroup,
}

```

#### dragOver

```typescript
export interface DragOverEvent {
    startIndex: number,
    startGroup: MoveGroup,
    currentIndex: number,
    currentGroup: MoveGroup
}


```

#### dragCross

```typescript
export interface DragCrossEvent {
    order: number[],
    startIndex: number,
    startGroup: MoveGroup,
    currentIndex: number,
    currentGroup: MoveGroup
    lastCurrentIndex: number,
}


```

#### beforeDrop

```typescript
export interface BeforeDropEvent {
    startIndex: number,
    startGroup: MoveGroup,
    endIndex: number,
    endGroup: MoveGroup
}

```

#### drop

```typescript
export interface DropEvent {
    startIndex: number,
    startGroup: MoveGroup,
    endIndex: number,
    endGroup: MoveGroup
}


```

#### dragEnd

```typescript
export interface DragEndEvent {
    startIndex: number,
    startGroup: MoveGroup,
    endIndex: number,
    endGroup: MoveGroup,
    order: number[]
}


```

#### orderChange

```typescript
export interface OrderChangeEvent {
    order: number[],
    startIndex: number,
    startGroup: MoveGroup,
    endIndex: number,
    endGroup: MoveGroup
}
```


