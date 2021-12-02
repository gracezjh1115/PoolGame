import {tiny} from "../tiny-graphics.js";

export class StatusBar {

    static currentBar;

    constructor(element) {
        StatusBar.currentBar = this;
        this.element = element;

        const rules = [".status-bar-widget { width: 1080px; height: 80px; background: Black; " +
                        "margin:auto; color: white; display: flex; }",
                        ".player-logo-frame { width: 80px; height: 100%; }",
                        ".player-logo { width: 60px; height: 60px; margin: 10px; z-index: 2; }",
                        ".filler { flex: 1; }",
        ];

        if (document.styleSheets.length === 0) document.head.appendChild(document.createElement("style"));
        for (const r of rules) document.styleSheets[document.styleSheets.length - 1].insertRule(r, 0)

        this.updateStatus(true, 0, 0)
    }

    setInnerHTML(newText) {
        if (this.lastInnerHTML !== newText) {
            this.element.innerHTML = newText
            this.lastInnerHTML = newText
        }
    }

    updateStatus(playByUcla, uclaScore, uscScore) {
        this.setInnerHTML(
            '<span class="filler"></span>' +
            `<image class="player-logo-frame" src="${playByUcla ? './assets/bruin-glow.png' : './assets/bruin-normal.png'}"></image>` +
            `<h1> UCLA:  ${uclaScore} v. s. USC:  ${uscScore} </h1>` +
            `<image class="player-logo-frame" src="${playByUcla ? './assets/usc-normal.png' : './assets/usc-glow.png'}"></image>` +
            '<span class="filler"></span>'
        )
    }
}
