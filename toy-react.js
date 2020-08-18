const RENDER_TO_DOM = Symbol('render to dom');
class ElementWrapper {
    // 因为渲染的时候，我们使用的是new type，所以必然class是一个可以使用new来操作的构造函数
    constructor(type) {
        // 这里的type是用于传递createElement的标签名的，我们在创建一个组件的时候，必然需要传递一个元素标签进去
        this.root = document.createElement(type);
    }

    // 要实现setAttribute和appendChild
    setAttribute(name, value) {
        // \s\S这样的正则表达式是一种比较稳妥的表示全部字符的方式
        if (name.match(/^on([\s\S]+)/)) {
            // 如果我们写的是onClick这样的格式，需要将驼峰的写法改成小写事件名称
            this.root.addEventListener(RegExp.$1.replace(/^[\s\S]/, c => c.toLowerCase()), value);
        } else {
            if (name === 'className') {
                this.root.setAttribute('class', value);
            } else {
                this.root.setAttribute(name, value);
            }
        }
    }
    appendChild(component) {
        let range = document.createRange();
        range.setStart(this.root, this.root.childNodes.length); // offset设置为0 表示从parentElement的第一个children到最后一个children
        // 这里之所以使用childNodes而不使用children是因为我们需要获取到所有的节点，包括注释以及文本在内，
        // 而children只会获取到元素节点
        range.setEnd(this.root, this.root.childNodes.length);
        component[RENDER_TO_DOM](range);
    }
    [RENDER_TO_DOM](range) {
        range.deleteContents();
        range.insertNode(this.root);
    }
}

// 文本节点没有属性，所以不需要设置setAttribute
// 当然文本节点自己也没有子节点，自然是不需要appendChild
class TextWrapper {
    constructor(content) {
        // 这里的content是用于给createTextNode做为文案参数的，所以必然是一个字符串
        this.root = document.createTextNode(content);
    }
    [RENDER_TO_DOM](range) {
        range.deleteContents();
        range.insertNode(this.root);
    }
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

    // 私有方法
    [RENDER_TO_DOM](range) {
        this._range = range;
        this.render()[RENDER_TO_DOM](range);
    }

    // 重新绘制
    rerender() {
        let oldRange = this._range;
        // 先进行range的插入，再将旧的range清除，这样就可以保证tic-tac-toe里面不会出现空格丢失的情况了
        // 这里出现问题的原因在于，如果我们的range内容空掉了，那么这个range实际上是会消失的，这个range后面跟着的
        // range会紧接着补上来导致旧range被吃掉，为了不让旧range被吃掉，我们需要在旧range的内容前面加入一个新的range
        let range = document.createRange();
        range.setStart(oldRange.startContainer, oldRange.startOffset);
        range.setEnd(oldRange.startContainer, oldRange.startOffset);
        // 调用renderToDom方法去渲染
        this[RENDER_TO_DOM](range);

        // 这里要注意，如果要删除旧range，必须要把旧range的范围进行重设，这里需要把旧range的开始位置挪到新range的结束位置
        // 因为在插入新range的时候必然会导致旧range的扩大
        oldRange.setStart(range.endContainer, range.endOffset);
        oldRange.deleteContents();
    }

    // 假设此时已经有state对象了，考虑React中state的表现，这里的state需要做一个属性的深拷贝合并
    // 比如一个结构稍微复杂的state对象，在更新某一个属性的时候，是将旧的state对象拷贝到新的state对象上
    // 但是仍不可避免的会出现我们并没有去初始化state，此时state是null，那么就直接将新的state赋值给state即可
    // 并且要rerender一下，否则页面仍然会显示旧版本的state所对应的数据
    setState(newState) {
        if (newState === null || typeof newState !== 'object') {
            this.state = newState;
            this.rerender();
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
        this.rerender();
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
