const RENDER_TO_DOM = Symbol('render to dom');

function replaceContent(range, node) {
    range.insertNode(node);
    range.setStartAfter(node);
    range.deleteContents();

    range.setStartBefore(node);
    range.setEndAfter(node);
}

export class Component {
    constructor() {
        this.props = Object.create(null);
        this.children = [];
        this._range = null;

    }

    setAttribute(name, value) {
        this.props[name] = value;
    }

    appendChild(component) {
        this.children.push(component);
    }

    get vdom() {
        // 因为Component的内容是由render决定的，所以直接执行render返回对应的组件内容
        // 这里的this.render仍然是一个递归的调用，如果this.render出来的结果是一个Component，那么仍旧会继续去调用这个内部的vdom getter
        // 直到最后获取到普通的元素节点或者文本节点
        return this.render().vdom;
    }

    // 私有方法
    [RENDER_TO_DOM](range) {
        this._range = range;
        this._vdom = this.vdom;
        // 这里原来的写法是this.root, 但是实际上这里的更新并不是在做真正的DOM更新
        // 所以不能直接使用真实DOM进行处理，要使用虚拟DOM进行，而虚拟DOM则需要将当时的vdom进行存储，
        // 即上面的this._vdom
        // this.root[RENDER_TO_DOM](range);
        this._vdom[RENDER_TO_DOM](range);
    }

    update() {
        let isSameNode = (oldNode, newNode) => {
            // 类型不同
            if (oldNode.type !== newNode.type) {
                return false;
            }

            // 属性不同
            // for-in适合遍历对象，因为for-in主要面向的是遍历对象的属性，如果恰好这个对象是个数组的话，那么遍历的就是数组的索引
            for (let name in newNode.props) {
                if (newNode.props[name] !== oldNode.props[name]) {
                    return false;
                }
            }

            // todo 留一个疑问，这里为什么是>而不是!==
            if (Object.keys(oldNode.props).length > Object.keys(newNode.props).length) {
                return false;
            }

            if (newNode.type === '#text') {
                if (newNode.content !== oldNode.content) {
                    return false;
                }
            }

            return true;
        };


        let update = (oldNode, newNode) => {
            // 节点对比的顺序
            // type props children 如果type或者props不同则说明是完全不一样的子节点 除非根节点的type和props是完全一致的，我们
            // 才认为这个根节点是不需要更新的，之后才会去看根节点里面的children
            // 如果是文本节点，那么需要去关注它的content

            // 进行旧结点的覆盖
            if (!isSameNode(oldNode, newNode)) {
                // 这里是一个完全的全新渲染
                newNode[RENDER_TO_DOM](oldNode._range);
                return;
            }

            newNode._range = oldNode._range;

            let newChildren = newNode.vchildren;
            let oldChildren = oldNode.vchildren;

            if (!newChildren || !newChildren.length) {
                return;
            }

            let tailRange = oldChildren[oldChildren.length - 1]._range;

            for (let i = 0; i < newChildren.length; i++) {
                let newChild = newChildren[i];
                let oldChild = oldChildren[i];

                if (i < oldChildren.length) {
                    update(oldChild, newChild);
                } else {
                    // 如果newChildren的长度比newChildren的长，就说明新的子节点是要多于旧节点
                    // 首先获取一下旧的节点的最后一个边缘位置，在这里进行新节点的插入
                    let range = document.createRange();
                    range.setStart(tailRange.endContainer, tailRange.endOffset);
                    range.setEnd(tailRange.endContainer, tailRange.endOffset);
                    newChild[RENDER_TO_DOM](range);

                    // 后面如果继续要追加range，就必须让tailRange往后稍稍
                    tailRange = range;
                }
            }
        };

        let vdom = this.vdom;
        update(this._vdom, vdom);

        this._vdom = vdom; // 将新的vdom替换到当前的vdom上来
    }


    // 假设此时已经有state对象了，考虑React中state的表现，这里的state需要做一个属性的深拷贝合并
    // 比如一个结构稍微复杂的state对象，在更新某一个属性的时候，是将旧的state对象拷贝到新的state对象上
    // 但是仍不可避免的会出现我们并没有去初始化state，此时state是null，那么就直接将新的state赋值给state即可
    // 并且要rerender一下，否则页面仍然会显示旧版本的state所对应的数据
    setState(newState) {
        if (newState === null || typeof newState !== 'object') {
            this.state = newState;
            this.update();
            return;
        }
        // merge会被递归地调用
        let merge = (oldState, newState) => {
            for (let p in newState) {
                if (oldState[p] === null || typeof oldState[p] !== 'object') {
                    oldState[p] = newState[p];
                } else {
                    // 如果是对象的话，就需要递归地调用merge
                    merge(oldState[p], newState[p]);
                }
            }
        };

        merge(this.state, newState);
        this.update();
    }
}

class ElementWrapper extends Component {
    // 因为渲染的时候，我们使用的是new type，所以必然class是一个可以使用new来操作的构造函数
    constructor(type) {
        // 以下是Component组件的构造函数里的内容, 在ElementWrapper里面使用super就可以调用父组件的构造函数
        // 这让ElementWrapper也拥有了自己的props以及children
        // this.props = Object.create(null);
        // this.children = [];
        // this._range = null;
        super(type);
        this.type = type;
    }

    // 获取虚拟DOM
    get vdom () {
        this.vchildren = this.children.map(child => child.vdom);
        return this;
        // return {
            // 虚拟DOM中需要包含的三样东西
            // type: this.type,
            // props: this.props,
            // children: this.children.map(child => child.vdom),
        // };
    }

    [RENDER_TO_DOM](range) {
        this._range = range;
        let root = document.createElement(this.type);

        // 一个虚拟DOM上最主要的内容就是三大块： root/props/children
        for (let name in this.props) {
            const value = this.props[name];
            if (name.match(/^on([\s\S]+)/)) {
                // 如果我们写的是onClick这样的格式，需要将驼峰的写法改成小写事件名称
                root.addEventListener(RegExp.$1.replace(/^[\s\S]/, c => c.toLowerCase()), value);
            } else {
                if (name === 'className') {
                    root.setAttribute('class', value);
                } else {
                    root.setAttribute(name, value);
                }
            }
        }

        // 如果一上来就进行渲染会出现vchildren不存在的情况，所以为了保证可以获取到，这里必须进行判断
        if (!this.vchildren) {
            this.vchildren = this.children.map(child => child.vdom);
        }
        // children是一个数组，所以这里使用for-of
        // 这里的处理实际上就是将children节点插入
        for (let child of this.vchildren) {
            let childRange = document.createRange();
            childRange.setStart(root, root.childNodes.length); // offset设置为0 表示从parentElement的第一个children到最后一个children
            // 这里之所以使用childNodes而不使用children是因为我们需要获取到所有的节点，包括注释以及文本在内，
            // 而children只会获取到元素节点
            childRange.setEnd(root, root.childNodes.length);

            child[RENDER_TO_DOM](childRange);
        }

        replaceContent(range, root);
    }
}

// 文本节点没有属性，所以不需要设置setAttribute
// 当然文本节点自己也没有子节点，自然是不需要appendChild
class TextWrapper extends Component {
    constructor(content) {
        super(content);
        this.type = '#text';
        this.content = content;
        // 这里的content是用于给createTextNode做为文案参数的，所以必然是一个字符串
    }

    get vdom () {
        return this;
       }

    [RENDER_TO_DOM](range) {
        this._range = range;
        let root = document.createTextNode(this.content);
        replaceContent(range, root);
    }
}

// 这里要注意，如果我们在参数上使用了展开符号，那么之后的参数都会被当做
// 数组来处理
export function createElement(type, attributes, ...children) {
    let e;
    if (typeof type === 'string') {
        e = new ElementWrapper(type);
    } else {
        e = new type;
    }

    for (let k in attributes) {
        e.setAttribute(k, attributes[k]);
    }

    // 一直递归调用
    let insertChildren = (children) => {
        for (let child of children) {
            if (child === null) {
                // 回顾一个小知识点：for of是可以continue和break
                continue;
            }

            if (typeof child === 'string' || typeof child === 'number') {
                child = new TextWrapper(child);
            }

            if ((typeof child === 'object') && (child instanceof Array)) {
                insertChildren(child);
            } else {
                e.appendChild(child);
            }
        }
    };

    insertChildren(children);

    return e;
}

export function render(component, parentElement) {
    let range = document.createRange();
    range.setStart(parentElement, 0); // offset设置为0 表示从parentElement的第一个children到最后一个children
    // 这里之所以使用childNodes而不使用children是因为我们需要获取到所有的节点，包括注释以及文本在内，
    // 而children只会获取到元素节点
    range.setEnd(parentElement, parentElement.childNodes.length);
    range.deleteContents();
    // 这里component一定是一个DOM
    component[RENDER_TO_DOM](range);
}
