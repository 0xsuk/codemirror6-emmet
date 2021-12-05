import type { SyntaxType, AbbreviationContext } from 'emmet';
import { attributes } from '@emmetio/html-matcher';
import type { EditorState } from '@codemirror/state';
import { language, syntaxTree } from '@codemirror/language';
import { cssLanguage } from '@codemirror/lang-css';
import { htmlLanguage } from '@codemirror/lang-html';
import type { SyntaxNode } from '@lezer/common';
import { getContext } from './context';
import type { HTMLContext, CSSContext } from './types';
import type { EnableForSyntax } from './config';
import { last, attributeValue, getTagAttributes } from './utils';

const xmlSyntaxes = ['xml', 'xsl', 'jsx'];
const htmlSyntaxes = ['html', 'htmlmixed', 'vue'];
const cssSyntaxes = ['css', 'scss', 'less'];
const jsxSyntaxes = ['jsx', 'tsx'];
const markupSyntaxes = ['haml', 'jade', 'pug', 'slim'].concat(htmlSyntaxes, xmlSyntaxes, jsxSyntaxes);
const stylesheetSyntaxes = ['sass', 'sss', 'stylus', 'postcss'].concat(cssSyntaxes);

export interface SyntaxInfo {
    type: SyntaxType;
    syntax?: string;
    inline?: boolean;
    context?: HTMLContext | CSSContext;
}

export interface StylesheetRegion {
    range: [number, number];
    syntax: string;
    inline?: boolean;
}

export interface SyntaxCache {
    stylesheetRegions?: StylesheetRegion[];
}

const enum TokenType {
    Selector = "selector",
    PropertyName = "propertyName",
    PropertyValue = "propertyValue",
    BlockEnd = "blockEnd"
}

const enum CSSAbbreviationScope {
    /** Include all possible snippets in match */
    Global = "@@global",
    /** Include raw snippets only (e.g. no properties) in abbreviation match */
    Section = "@@section",
    /** Include properties only in abbreviation match */
    Property = "@@property",
    /** Resolve abbreviation in context of CSS property value */
    Value = "@@value"
}

/**
 * Returns Emmet syntax info for given location in view.
 * Syntax info is an abbreviation type (either 'markup' or 'stylesheet') and syntax
 * name, which is used to apply syntax-specific options for output.
 *
 * By default, if given location doesn’t match any known context, this method
 * returns `null`, but if `fallback` argument is provided, it returns data for
 * given fallback syntax
 */
export function syntaxInfo(state: EditorState, ctx?: number | HTMLContext | CSSContext): SyntaxInfo {
    let syntax = docSyntax(state);
    let inline: boolean | undefined;
    let context = typeof ctx === 'number' ? getContext(state, ctx) : ctx;

    if (context?.type === 'html' && context.css) {
        inline = true;
        syntax = 'css';
        context = context.css;
    } else if (context?.type === 'css') {
        syntax = 'css';
    }

    return {
        type: getSyntaxType(syntax),
        syntax,
        inline,
        context
    };
}

/**
 * Returns main editor syntax
 */
export function docSyntax(state: EditorState): string {
    const topLang = state.facet(language);
    if (topLang === cssLanguage) {
        return 'css';
    }

    if (topLang === htmlLanguage) {
        return 'html';
    }
    return '';
}

/**
 * Returns Emmet abbreviation type for given syntax
 */
export function getSyntaxType(syntax?: string): SyntaxType {
    return syntax && stylesheetSyntaxes.includes(syntax) ? 'stylesheet' : 'markup';
}

/**
 * Check if given syntax is XML dialect
 */
export function isXML(syntax?: string): boolean {
    return syntax ? xmlSyntaxes.includes(syntax) : false;
}

/**
 * Check if given syntax is HTML dialect (including XML)
 */
export function isHTML(syntax?: string): boolean {
    return syntax
        ? htmlSyntaxes.includes(syntax) || isXML(syntax)
        : false;
}

/**
 * Check if given syntax name is supported by Emmet
 */
export function isSupported(syntax: string): boolean {
    return syntax
        ? markupSyntaxes.includes(syntax) || stylesheetSyntaxes.includes(syntax)
        : false;
}

/**
 * Check if given syntax is a CSS dialect. Note that it’s not the same as stylesheet
 * syntax: for example, SASS is a stylesheet but not CSS dialect (but SCSS is)
 */
export function isCSS(syntax?: string): boolean {
    return syntax ? cssSyntaxes.includes(syntax) : false;
}

/**
 * Check if given syntax is JSX dialect
 */
export function isJSX(syntax?: string): boolean {
    return syntax ? jsxSyntaxes.includes(syntax) : false;
}

/**
 * Check if given option if enabled for specified syntax
 */
export function enabledForSyntax(opt: EnableForSyntax, info: SyntaxInfo) {
    if (opt === true) {
        return true;
    }

    if (Array.isArray(opt)) {
        const candidates: string[] = [info.type, info.syntax!];
        if (info.inline) {
            candidates.push(`${info.type}-inline`, `${info.syntax!}-inline`);
        }

        return candidates.some(c => opt.includes(c));
    }

    return false;
}

/**
 * Returns embedded stylesheet syntax from given HTML context
 */
export function getEmbeddedStyleSyntax(code: string, ctx: HTMLContext): string | void {
    const parent = last(ctx.ancestors);
    if (parent && parent.name === 'style') {
        for (const attr of attributes(code.slice(parent.range[0], parent.range[1]), parent.name)) {
            if (attr.name === 'type') {
                return attributeValue(attr);
            }
        }
    }
}

/**
 * Returns context for Emmet abbreviation from given HTML context
 */
export function getMarkupAbbreviationContext(state: EditorState, ctx: HTMLContext): AbbreviationContext | undefined {
    const parent = last(ctx.ancestors);
    if (parent) {
        let node: SyntaxNode | null = syntaxTree(state).resolve(parent.range[0], 1);
        while (node && node.name !== 'OpenTag') {
            node = node.parent;
        }

        return {
            name: parent.name,
            attributes: node ? getTagAttributes(state, node) : {}
        };
    }

    return;
}

/**
 * Returns context for Emmet abbreviation from given CSS context
 */
export function getStylesheetAbbreviationContext(ctx: CSSContext): AbbreviationContext {
    if (ctx.inline) {
        return { name: CSSAbbreviationScope.Property }
    }

    const parent = last(ctx.ancestors);
    let scope: string = CSSAbbreviationScope.Global;
    if (ctx.current) {
        if (ctx.current.type === TokenType.PropertyValue && parent) {
            scope = parent.name;
        } else if ((ctx.current.type === TokenType.Selector || ctx.current.type === TokenType.PropertyName) && !parent) {
            scope = CSSAbbreviationScope.Section;
        }
    }

    return {
        name: scope
    };
}
