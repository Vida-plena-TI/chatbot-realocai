// DOM mínimo para montar componentes com react-dom/client no Node, sem dependências (o SSR
// não executa error boundaries). Só o que o React 18 usa para criar, atualizar e remover nós;
// sem layout, CSS nem eventos de verdade. Instale antes de carregar react-dom.
class Node {
  constructor(nodeType, nodeName, ownerDocument) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.ownerDocument = ownerDocument;
    this.childNodes = [];
    this.parentNode = null;
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes.at(-1) ?? null; }
  get nextSibling() {
    const irmaos = this.parentNode?.childNodes ?? [];
    return irmaos[irmaos.indexOf(this) + 1] ?? null;
  }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) {
    n.parentNode?.removeChild(n);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, n);
    n.parentNode = this;
    return n;
  }
  removeChild(n) {
    this.childNodes.splice(this.childNodes.indexOf(n), 1);
    n.parentNode = null;
    return n;
  }
  addEventListener() {}
  removeEventListener() {}
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) {
    this.childNodes.forEach((c) => (c.parentNode = null));
    this.childNodes = v === '' || v == null ? [] : [new Text(String(v), this.ownerDocument)];
    this.childNodes.forEach((c) => (c.parentNode = this));
  }
}

class Text extends Node {
  constructor(data, doc) {
    super(3, '#text', doc);
    this.nodeValue = data;
  }
  get data() { return this.nodeValue; }
  set data(v) { this.nodeValue = v; }
  get textContent() { return this.nodeValue; }
  set textContent(v) { this.nodeValue = String(v); }
}

const escapar = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

class Element extends Node {
  constructor(tag, doc, namespaceURI) {
    super(1, tag.toUpperCase(), doc);
    this.tagName = this.nodeName;
    this.namespaceURI = namespaceURI;
    this.attributes = new Map();
    this.style = {};
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  removeAttribute(k) { this.attributes.delete(k); }
  hasAttribute(k) { return this.attributes.has(k); }
  set className(v) { this.setAttribute('class', v); }
  get className() { return this.getAttribute('class') ?? ''; }
  focus() {}
  blur() {}
  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    const attrs = [...this.attributes].map(([k, v]) => ` ${k}="${escapar(v)}"`).join('');
    const filhos = this.childNodes.map((c) => (c.nodeType === 3 ? escapar(c.nodeValue) : c.outerHTML)).join('');
    return `<${tag}${attrs}>${filhos}</${tag}>`;
  }
  get innerHTML() { return this.childNodes.map((c) => (c.nodeType === 3 ? escapar(c.nodeValue) : c.outerHTML)).join(''); }
}

class Document extends Node {
  constructor() {
    super(9, '#document', null);
    this.documentElement = new Element('html', this);
    this.body = new Element('body', this);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.activeElement = this.body;
  }
  createElement(tag) { return new Element(tag, this, 'http://www.w3.org/1999/xhtml'); }
  createElementNS(ns, tag) { return new Element(tag, this, ns); }
  createTextNode(data) { return new Text(String(data), this); }
  createComment() { return new Text('', this); }
}

/** Instala `window` e `document` globais e devolve o document. */
export function instalarDom() {
  const document = new Document();
  class HTMLIFrameElement extends Element {}
  const window = { document, HTMLIFrameElement, navigator: { userAgent: 'node' }, addEventListener() {}, removeEventListener() {}, getSelection: () => null };
  Object.assign(globalThis, { window, document, HTMLIFrameElement });
  return document;
}
