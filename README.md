# Legato Dnd
Lite, fast and configurable drag & drop list.


## Basic Usage
```javascript
const el = document.getElementById('container')
for (let i=0;i<10;++i) {
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
#### leaveViewportEdge
#### enterContainerEdge
#### leaveContainerEdge

### Programming Scroll
#### programmingScrollStart
#### programmingScrollEnd
#### programmingScrollError
#### programmingScroll

### Drag Lifecycle
#### beforeDragStart
#### dragStart
#### dragOver
#### dragCross
#### beforeDrop
#### drop
#### dragEnd
#### orderChange


