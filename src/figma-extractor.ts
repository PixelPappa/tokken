import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

interface FigmaConfig {
  accessToken: string;
  fileKey: string;
  outputDir: string;
  figmaUrl?: string;
}

interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  backgroundColor?: FigmaColor;
  fills?: any[];
  strokes?: any[];
  effects?: any[];
  characters?: string;
  style?: any;
  styles?: Record<string, string>; // Maps style type to style ID
  // Auto-layout properties
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  // Border radius
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  // Stroke
  strokeWeight?: number;
  // Alignment
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  // Component properties
  componentPropertyDefinitions?: Record<string, {
    type: string;
    defaultValue: any;
    variantOptions?: string[];
  }>;
  // Bounding box
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface FigmaStyleMeta {
  key: string;
  name: string;
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
  description: string;
  node_id: string;
}

interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  componentSetId?: string;
}

interface FigmaFile {
  document: FigmaNode;
  styles: Record<string, FigmaStyleMeta>;
  components: Record<string, FigmaComponentMeta>;
  componentSets?: Record<string, { key: string; name: string; description: string }>;
}

// Extracted data types
interface PublishedColorStyle {
  name: string;
  hex: string;
  opacity: number;
  styleId: string;
}

interface PublishedTextStyle {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | null;
  letterSpacing: number | null;
  styleId: string;
}

interface PublishedEffectStyle {
  name: string;
  effects: any[];
  styleId: string;
}

interface ComponentStyle {
  colors: string[];       // unique hex colors used
  typography: Array<{
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight?: number | null;
  }>;
  spacing: {
    paddings: Array<{ top: number; right: number; bottom: number; left: number }>;
    gaps: number[];
  };
  borders: {
    radii: Array<number | [number, number, number, number]>;
    strokeWeights: number[];
  };
  effects: Array<{
    type: string;
    offset?: { x: number; y: number };
    radius?: number;
    spread?: number;
    color?: { r: number; g: number; b: number; a: number };
  }>;
  layout: Array<{
    mode: string;
    primaryAlign?: string;
    counterAlign?: string;
  }>;
}

interface ExtractedComponent {
  name: string;
  description: string;
  variants: string[];
  properties: Record<string, { type: string; defaultValue: any; options?: string[] }>;
  setName?: string;
  nodeId: string; // The node ID to use for image export (set ID for variants, component ID for standalone)
  styles?: ComponentStyle;
  group?: string; // Containing frame name from the Figma file (the "page" the component lives on)
}

interface ThemeVariable {
  name: string;
  type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
  valuesByMode: Record<string, any>; // modeName -> resolved value
}

interface ThemeCollection {
  name: string;
  modes: string[];
  variables: ThemeVariable[];
}

interface ThemeData {
  collections: ThemeCollection[];
}

interface FigmaVariablesResponse {
  meta: {
    variableCollections: Record<string, {
      id: string;
      name: string;
      modes: Array<{ modeId: string; name: string }>;
      defaultModeId: string;
      variableIds: string[];
    }>;
    variables: Record<string, {
      id: string;
      name: string;
      resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
      valuesByMode: Record<string, any>;
      variableCollectionId: string;
    }>;
  };
}

interface DesignSystemData {
  fileName: string;
  figmaUrl: string;
  extractedAt: string;
  publishedColorStyles: PublishedColorStyle[];
  publishedTextStyles: PublishedTextStyle[];
  publishedEffectStyles: PublishedEffectStyle[];
  rawColors: Map<string, number>; // hex → usage count
  rawTypography: Map<string, any>;
  rawEffects: any[];
  components: ExtractedComponent[];
  gridStyles: any[];
  themes?: ThemeData;
  componentImages?: Record<string, string>; // component name → filename
  iconSvgs?: Record<string, string>; // icon name → filename
}

class FigmaExtractor {
  private config: FigmaConfig;
  private baseUrl = 'https://api.figma.com/v1';

  constructor(config: FigmaConfig) {
    this.config = config;
  }

  /**
   * Extract file key from Figma URL
   */
  static extractFileKey(url: string): string {
    const match = url.match(/\/(file|design)\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      throw new Error(
        'Invalid Figma URL. Expected: https://www.figma.com/file/FILE_KEY/... or https://www.figma.com/design/FILE_KEY/...'
      );
    }
    return match[2];
  }

  /**
   * Fetch file data from Figma API with retry logic
   */
  async fetchFileData(): Promise<FigmaFile> {
    return this.fetchWithRetry(async () => {
      const response = await axios.get(
        `${this.baseUrl}/files/${this.config.fileKey}`,
        {
          headers: { 'X-Figma-Token': this.config.accessToken },
        }
      );
      return response.data;
    });
  }

  /**
   * Fetch specific nodes by ID from Figma API
   */
  async fetchNodes(nodeIds: string[]): Promise<Record<string, FigmaNode>> {
    if (nodeIds.length === 0) return {};
    return this.fetchWithRetry(async () => {
      const ids = nodeIds.join(',');
      const response = await axios.get(
        `${this.baseUrl}/files/${this.config.fileKey}/nodes?ids=${encodeURIComponent(ids)}`,
        {
          headers: { 'X-Figma-Token': this.config.accessToken },
        }
      );
      const result: Record<string, FigmaNode> = {};
      const nodes = response.data?.nodes || {};
      for (const [id, data] of Object.entries(nodes)) {
        if ((data as any)?.document) {
          result[id] = (data as any).document;
        }
      }
      return result;
    });
  }

  /**
   * Fetch local variables from Figma (for themes/modes)
   */
  async fetchVariables(): Promise<FigmaVariablesResponse | null> {
    try {
      return await this.fetchWithRetry(async () => {
        const response = await axios.get(
          `${this.baseUrl}/files/${this.config.fileKey}/variables/local`,
          {
            headers: { 'X-Figma-Token': this.config.accessToken },
          }
        );
        return response.data;
      });
    } catch (error: any) {
      // Variables API may not be available on all plans or files
      if (error.response?.status === 403 || error.response?.status === 404) {
        console.log('  Variables API not available (may require a paid Figma plan)');
        return null;
      }
      throw error;
    }
  }

  /**
   * Extract theme data from Figma variables
   */
  extractThemes(variablesData: FigmaVariablesResponse): ThemeData {
    const collections: ThemeCollection[] = [];
    const { variableCollections, variables } = variablesData.meta;

    for (const [, collection] of Object.entries(variableCollections)) {
      const modes = collection.modes.map(m => m.name);
      const modeIdToName = new Map(collection.modes.map(m => [m.modeId, m.name]));

      const themeVars: ThemeVariable[] = [];

      for (const varId of collection.variableIds) {
        const variable = variables[varId];
        if (!variable) continue;

        const valuesByMode: Record<string, any> = {};

        for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
          const modeName = modeIdToName.get(modeId) || modeId;

          if (variable.resolvedType === 'COLOR' && value && typeof value === 'object' && 'r' in value) {
            // Convert Figma color to hex
            valuesByMode[modeName] = this.rgbToHex(value.r, value.g, value.b);
            if (value.a !== undefined && value.a < 1) {
              valuesByMode[modeName] += ` (${Math.round(value.a * 100)}%)`;
            }
          } else {
            valuesByMode[modeName] = value;
          }
        }

        themeVars.push({
          name: variable.name,
          type: variable.resolvedType,
          valuesByMode,
        });
      }

      // Sort variables by name for readability
      themeVars.sort((a, b) => a.name.localeCompare(b.name));

      collections.push({ name: collection.name, modes, variables: themeVars });
    }

    return { collections };
  }

  /**
   * Get top-level frames from the file
   */
  getFrames(fileData: FigmaFile): Array<{ id: string; name: string }> {
    const frames: Array<{ id: string; name: string }> = [];

    const traverseNode = (node: FigmaNode, depth: number = 0) => {
      // Only collect top-level frames (direct children of pages)
      if (node.type === 'FRAME' && depth <= 2) {
        frames.push({ id: node.id, name: node.name });
      }
      if (node.children && depth < 2) {
        node.children.forEach(child => traverseNode(child, depth + 1));
      }
    };

    traverseNode(fileData.document);
    return frames;
  }

  /**
   * Export frames as images
   */
  async exportFrameImages(
    frameIds: string[],
    format: 'png' | 'jpg' | 'svg' = 'png',
    scale: number = 2
  ): Promise<Record<string, string>> {
    return this.fetchWithRetry(async () => {
      const response = await axios.get(
        `${this.baseUrl}/images/${this.config.fileKey}`,
        {
          headers: { 'X-Figma-Token': this.config.accessToken },
          params: { ids: frameIds.join(','), format, scale },
        }
      );
      return response.data.images;
    });
  }

  /**
   * Download frame images to local directory
   */
  async downloadFrameImages(frames: Array<{ id: string; name: string }>) {
    console.log(`Downloading ${frames.length} frames...`);

    const frameIds = frames.map(f => f.id);
    const imageUrls = await this.exportFrameImages(frameIds);

    await fs.mkdir(this.config.outputDir, { recursive: true });

    const downloads = frames.map(async (frame, index) => {
      const imageUrl = imageUrls[frame.id];
      if (!imageUrl) {
        console.warn(`  No image URL for frame: ${frame.name}`);
        return null;
      }

      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const sanitizedName = frame.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const filename = `${String(index + 1).padStart(2, '0')}-${sanitizedName}.png`;
      const filepath = path.join(this.config.outputDir, filename);

      await fs.writeFile(filepath, response.data);
      console.log(`  Downloaded: ${filename}`);

      return { id: frame.id, name: frame.name, filename, filepath };
    });

    return (await Promise.all(downloads)).filter(Boolean);
  }

  /**
   * Determine if a component is an icon (vs a UI component)
   */
  private isIcon(comp: ExtractedComponent): boolean {
    return comp.variants.length === 0
      && Object.keys(comp.properties).length === 0
      && /^[a-z0-9_/\-]+$/.test(comp.name);
  }

  /**
   * Extract colors and typography from a component's node subtree
   */
  private extractComponentStyles(node: FigmaNode): ComponentStyle {
    const colorSet = new Set<string>();
    const typographyMap = new Map<string, { fontFamily: string; fontSize: number; fontWeight: number; lineHeight?: number | null }>();
    const paddingSet = new Map<string, { top: number; right: number; bottom: number; left: number }>();
    const gapSet = new Set<number>();
    const radiusSet = new Set<string>();
    const strokeWeightSet = new Set<number>();
    const effectMap = new Map<string, { type: string; offset?: { x: number; y: number }; radius?: number; spread?: number; color?: { r: number; g: number; b: number; a: number } }>();
    const layoutMap = new Map<string, { mode: string; primaryAlign?: string; counterAlign?: string }>();

    const traverse = (n: FigmaNode) => {
      // Colors from fills
      if (n.fills && Array.isArray(n.fills)) {
        for (const fill of n.fills) {
          if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
            colorSet.add(this.rgbToHex(fill.color.r, fill.color.g, fill.color.b));
          }
        }
      }
      // Colors from strokes
      if (n.strokes && Array.isArray(n.strokes)) {
        for (const stroke of n.strokes) {
          if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
            colorSet.add(this.rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b));
          }
        }
      }
      // Typography from text nodes
      if (n.type === 'TEXT' && n.style) {
        const key = `${n.style.fontFamily}-${n.style.fontSize}-${n.style.fontWeight}`;
        if (!typographyMap.has(key)) {
          typographyMap.set(key, {
            fontFamily: n.style.fontFamily,
            fontSize: n.style.fontSize,
            fontWeight: n.style.fontWeight,
            lineHeight: n.style.lineHeightPx || null,
          });
        }
      }
      // Spacing from auto-layout nodes
      if (n.layoutMode && n.layoutMode !== 'NONE') {
        const top = n.paddingTop ?? 0;
        const right = n.paddingRight ?? 0;
        const bottom = n.paddingBottom ?? 0;
        const left = n.paddingLeft ?? 0;
        if (top > 0 || right > 0 || bottom > 0 || left > 0) {
          const key = `${top}-${right}-${bottom}-${left}`;
          if (!paddingSet.has(key)) {
            paddingSet.set(key, { top, right, bottom, left });
          }
        }
        if (n.itemSpacing != null && n.itemSpacing > 0) {
          gapSet.add(n.itemSpacing);
        }
        // Layout info
        const layoutKey = `${n.layoutMode}-${n.primaryAxisAlignItems || ''}-${n.counterAxisAlignItems || ''}`;
        if (!layoutMap.has(layoutKey)) {
          layoutMap.set(layoutKey, {
            mode: n.layoutMode,
            primaryAlign: n.primaryAxisAlignItems || undefined,
            counterAlign: n.counterAxisAlignItems || undefined,
          });
        }
      }
      // Border radius
      if (n.rectangleCornerRadii) {
        const key = n.rectangleCornerRadii.join('-');
        radiusSet.add(key);
      } else if (n.cornerRadius != null && n.cornerRadius > 0) {
        radiusSet.add(String(n.cornerRadius));
      }
      // Stroke weight
      if (n.strokeWeight != null && n.strokeWeight >= 0.5) {
        strokeWeightSet.add(Math.round(n.strokeWeight * 10) / 10);
      }
      // Effects (shadows, blurs)
      if (n.effects && Array.isArray(n.effects)) {
        for (const effect of n.effects) {
          if (effect.visible === false) continue;
          const key = JSON.stringify(effect);
          if (!effectMap.has(key)) {
            effectMap.set(key, {
              type: effect.type,
              offset: effect.offset ? { x: effect.offset.x, y: effect.offset.y } : undefined,
              radius: effect.radius ?? undefined,
              spread: effect.spread ?? undefined,
              color: effect.color ? { r: effect.color.r, g: effect.color.g, b: effect.color.b, a: effect.color.a ?? 1 } : undefined,
            });
          }
        }
      }
      if (n.children) n.children.forEach(traverse);
    };

    // If this is a COMPONENT_SET, skip the container frame's own styles
    // (its padding, border, radius, stroke are Figma editor artifacts, not design tokens).
    // Only extract styles from the child COMPONENT nodes inside it.
    if (node.type === 'COMPONENT_SET' && node.children) {
      node.children.forEach(traverse);
    } else {
      traverse(node);
    }

    // Parse radii back from dedup keys, rounding to integers
    const radii: Array<number | [number, number, number, number]> = [];
    const seenRadii = new Set<string>();
    for (const key of radiusSet) {
      const parts = key.split('-').map(v => Math.round(Number(v)));
      const roundedKey = parts.join('-');
      if (seenRadii.has(roundedKey)) continue;
      seenRadii.add(roundedKey);
      if (parts.length === 4) {
        radii.push(parts as [number, number, number, number]);
      } else {
        radii.push(parts[0]);
      }
    }

    return {
      colors: [...colorSet],
      typography: [...typographyMap.values()].sort((a, b) => a.fontSize - b.fontSize),
      spacing: {
        paddings: [...paddingSet.values()],
        gaps: [...gapSet].sort((a, b) => a - b),
      },
      borders: {
        radii: radii.sort((a, b) => (typeof a === 'number' ? a : a[0]) - (typeof b === 'number' ? b : b[0])),
        strokeWeights: [...strokeWeightSet].sort((a, b) => a - b),
      },
      effects: [...effectMap.values()],
      layout: [...layoutMap.values()],
    };
  }

  /**
   * Export component preview images as PNGs
   */
  async exportComponentImages(
    components: ExtractedComponent[]
  ): Promise<Record<string, string>> {
    const uiComponents = components.filter(c => !this.isIcon(c));
    if (uiComponents.length === 0) return {};

    const compDir = path.join(this.config.outputDir, 'components');
    await fs.mkdir(compDir, { recursive: true });

    const imageMap: Record<string, string> = {};
    const batchSize = 50;

    for (let i = 0; i < uiComponents.length; i += batchSize) {
      const batch = uiComponents.slice(i, i + batchSize);
      const ids = batch.map(c => c.nodeId);

      try {
        const imageUrls = await this.exportFrameImages(ids, 'png', 2);

        const downloads = batch.map(async (comp) => {
          const url = imageUrls[comp.nodeId];
          if (!url) return;

          try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            const sanitized = comp.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
            const filename = `${sanitized}.png`;
            await fs.writeFile(path.join(compDir, filename), response.data);
            imageMap[comp.name] = `components/${filename}`;
          } catch {
            // Skip individual download failures silently
          }
        });

        await Promise.all(downloads);
      } catch (error: any) {
        console.warn(`  Warning: Failed to export batch ${i / batchSize + 1} component images`);
      }
    }

    return imageMap;
  }

  /**
   * Export icon components as SVGs
   */
  async exportIconSvgs(
    components: ExtractedComponent[]
  ): Promise<Record<string, string>> {
    const icons = components.filter(c => this.isIcon(c));
    if (icons.length === 0) return {};

    const iconDir = path.join(this.config.outputDir, 'icons');
    await fs.mkdir(iconDir, { recursive: true });

    const svgMap: Record<string, string> = {};
    const batchSize = 50;

    for (let i = 0; i < icons.length; i += batchSize) {
      const batch = icons.slice(i, i + batchSize);
      const ids = batch.map(c => c.nodeId);

      try {
        const imageUrls = await this.exportFrameImages(ids, 'svg');

        const downloads = batch.map(async (icon) => {
          const url = imageUrls[icon.nodeId];
          if (!url) return;

          try {
            const response = await axios.get(url, { responseType: 'text' });
            const sanitized = icon.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
            const filename = `${sanitized}.svg`;
            await fs.writeFile(path.join(iconDir, filename), response.data);
            svgMap[icon.name] = `icons/${filename}`;
          } catch {
            // Skip individual download failures silently
          }
        });

        await Promise.all(downloads);
      } catch (error: any) {
        console.warn(`  Warning: Failed to export batch ${i / batchSize + 1} icon SVGs`);
      }
    }

    return svgMap;
  }

  // ─── Published Styles Extraction ──────────────────────────────────────

  /**
   * Extract published styles by finding the nodes that define them
   */
  async extractPublishedStyles(fileData: FigmaFile): Promise<{
    colors: PublishedColorStyle[];
    textStyles: PublishedTextStyle[];
    effectStyles: PublishedEffectStyle[];
    gridStyles: any[];
  }> {
    const stylesMeta = fileData.styles || {};
    const nodeMap = new Map<string, FigmaNode>();

    // Build a map of node ID → node for quick lookup from the document tree
    const indexNodes = (node: FigmaNode) => {
      nodeMap.set(node.id, node);
      if (node.children) node.children.forEach(indexNodes);
    };
    indexNodes(fileData.document);

    const styleEntries = Object.entries(stylesMeta);
    console.log(`  Styles in API response: ${styleEntries.length}`);

    // Style definition nodes often aren't in the document tree.
    // Fetch any missing nodes via the /nodes endpoint.
    const missingIds = styleEntries
      .map(([id]) => id)
      .filter(id => !nodeMap.has(id));

    if (missingIds.length > 0) {
      console.log(`  ${missingIds.length} style nodes not in document tree, fetching via /nodes API...`);
      const fetched = await this.fetchNodes(missingIds);
      for (const [id, node] of Object.entries(fetched)) {
        nodeMap.set(id, node);
      }
      console.log(`  Fetched ${Object.keys(fetched).length} nodes`);
    }

    const colors: PublishedColorStyle[] = [];
    const textStyles: PublishedTextStyle[] = [];
    const effectStyles: PublishedEffectStyle[] = [];
    const gridStyles: any[] = [];

    for (const [nodeId, meta] of styleEntries) {
      const node = nodeMap.get(nodeId);

      switch (meta.styleType) {
        case 'FILL': {
          if (node?.fills && Array.isArray(node.fills)) {
            const solidFill = node.fills.find((f: any) => f.type === 'SOLID');
            if (solidFill?.color) {
              colors.push({
                name: meta.name,
                hex: this.rgbToHex(solidFill.color.r, solidFill.color.g, solidFill.color.b),
                opacity: solidFill.opacity ?? solidFill.color.a ?? 1,
                styleId: nodeId,
              });
            }
          }
          break;
        }
        case 'TEXT': {
          if (node?.style) {
            textStyles.push({
              name: meta.name,
              fontFamily: node.style.fontFamily || 'Unknown',
              fontSize: node.style.fontSize || 0,
              fontWeight: node.style.fontWeight || 400,
              lineHeight: node.style.lineHeightPx || null,
              letterSpacing: node.style.letterSpacing || null,
              styleId: nodeId,
            });
          }
          break;
        }
        case 'EFFECT': {
          if (node?.effects && Array.isArray(node.effects)) {
            effectStyles.push({
              name: meta.name,
              effects: node.effects,
              styleId: nodeId,
            });
          }
          break;
        }
        case 'GRID': {
          // Grid styles are on the node's layoutGrids property
          if (node && (node as any).layoutGrids) {
            gridStyles.push({
              name: meta.name,
              grids: (node as any).layoutGrids,
              styleId: nodeId,
            });
          }
          break;
        }
      }
    }

    return { colors, textStyles, effectStyles, gridStyles };
  }

  // ─── Component Extraction ─────────────────────────────────────────────

  /**
   * Extract published components and their variants
   */
  extractComponents(fileData: FigmaFile): { components: ExtractedComponent[]; pageOrder: string[] } {
    const componentsMeta = fileData.components || {};
    const componentSetsMeta = fileData.componentSets || {};
    const nodeMap = new Map<string, FigmaNode>();
    const nodeFrameMap = new Map<string, string>(); // nodeId → containing group name
    const pageOrder: string[] = []; // Figma page names in their original order

    // Build node index AND track which Figma page (CANVAS) each node belongs to.
    // Components are grouped by their page name (e.g., "Calendar", "Buttons", "Icons").
    const indexNodes = (node: FigmaNode, group?: string) => {
      nodeMap.set(node.id, node);
      if (group) {
        nodeFrameMap.set(node.id, group);
      }
      if (node.children) {
        node.children.forEach(child => indexNodes(child, group));
      }
    };
    if (fileData.document.children) {
      for (const page of fileData.document.children) {
        nodeMap.set(page.id, page);
        pageOrder.push(page.name);
        if (page.children) {
          for (const topChild of page.children) {
            // Group by the Figma page name, not the individual component/frame name
            indexNodes(topChild, page.name);
          }
        }
      }
    }

    // Group components by their component set
    const setComponents = new Map<string, { meta: any; variants: string[]; variantNodeIds: string[] }>();
    const standaloneComponents: ExtractedComponent[] = [];

    for (const [nodeId, meta] of Object.entries(componentsMeta)) {
      // Skip internal/unpublished components (names starting with '.')
      if (meta.name.startsWith('.')) continue;

      if (meta.componentSetId) {
        // Skip if the parent set starts with '.'
        const setMeta = componentSetsMeta?.[meta.componentSetId];
        if (setMeta?.name?.startsWith('.')) continue;

        // Part of a variant set
        const existing = setComponents.get(meta.componentSetId);
        if (existing) {
          existing.variants.push(meta.name);
          existing.variantNodeIds.push(nodeId);
        } else {
          setComponents.set(meta.componentSetId, {
            meta: setMeta || { name: meta.name.split('/')[0], description: '' },
            variants: [meta.name],
            variantNodeIds: [nodeId],
          });
        }
      } else {
        // Standalone component
        const node = nodeMap.get(nodeId);
        const properties: Record<string, any> = {};

        if (node?.componentPropertyDefinitions) {
          for (const [propName, propDef] of Object.entries(node.componentPropertyDefinitions)) {
            properties[propName] = {
              type: propDef.type,
              defaultValue: propDef.defaultValue,
              options: propDef.variantOptions,
            };
          }
        }

        const styles = node ? this.extractComponentStyles(node) : undefined;
        const group = nodeFrameMap.get(nodeId);

        standaloneComponents.push({
          name: meta.name,
          description: meta.description || '',
          variants: [],
          properties,
          nodeId: nodeId,
          styles,
          group,
        });
      }
    }

    // Convert component sets to ExtractedComponent
    for (const [setId, data] of setComponents) {
      // Skip internal/unpublished component sets
      if (data.meta.name?.startsWith('.')) continue;

      const node = nodeMap.get(setId);
      const properties: Record<string, any> = {};

      if (node?.componentPropertyDefinitions) {
        for (const [propName, propDef] of Object.entries(node.componentPropertyDefinitions)) {
          properties[propName] = {
            type: propDef.type,
            defaultValue: propDef.defaultValue,
            options: propDef.variantOptions,
          };
        }
      }

      const styles = node ? this.extractComponentStyles(node) : undefined;
      const group = nodeFrameMap.get(setId);

      standaloneComponents.push({
        name: data.meta.name,
        description: data.meta.description || '',
        variants: data.variants,
        properties,
        setName: data.meta.name,
        nodeId: data.variantNodeIds[0] || setId, // Use first variant for clean image (avoids component set frame border)
        styles,
        group,
      });
    }

    return {
      components: standaloneComponents.sort((a, b) => a.name.localeCompare(b.name)),
      pageOrder,
    };
  }

  // ─── Raw Token Extraction (Node Tree Traversal) ───────────────────────

  /**
   * Extract all raw design tokens from the node tree
   */
  extractRawTokens(fileData: FigmaFile): {
    colors: Map<string, number>;
    typography: Map<string, any>;
    effects: any[];
  } {
    const colors = new Map<string, number>();
    const typography = new Map<string, any>();
    const effects: any[] = [];
    const seenEffects = new Set<string>();

    const addColor = (hex: string) => {
      colors.set(hex, (colors.get(hex) || 0) + 1);
    };

    const traverseNode = (node: FigmaNode) => {
      // Colors from fills
      if (node.fills && Array.isArray(node.fills)) {
        for (const fill of node.fills) {
          if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
            addColor(this.rgbToHex(fill.color.r, fill.color.g, fill.color.b));
          }
        }
      }

      // Colors from strokes
      if (node.strokes && Array.isArray(node.strokes)) {
        for (const stroke of node.strokes) {
          if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
            addColor(this.rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b));
          }
        }
      }

      // Typography from text nodes
      if (node.type === 'TEXT' && node.style) {
        const key = `${node.style.fontFamily}-${node.style.fontSize}-${node.style.fontWeight}`;
        if (!typography.has(key)) {
          typography.set(key, {
            fontFamily: node.style.fontFamily,
            fontSize: node.style.fontSize,
            fontWeight: node.style.fontWeight,
            lineHeight: node.style.lineHeightPx || null,
            letterSpacing: node.style.letterSpacing || null,
          });
        }
      }

      // Effects (shadows, blurs)
      if (node.effects && Array.isArray(node.effects)) {
        for (const effect of node.effects) {
          if (effect.visible === false) continue;
          const key = JSON.stringify(effect);
          if (!seenEffects.has(key)) {
            seenEffects.add(key);
            effects.push(effect);
          }
        }
      }

      // Recurse
      if (node.children) {
        node.children.forEach(traverseNode);
      }
    };

    traverseNode(fileData.document);

    return { colors, typography, effects };
  }

  // ─── Markdown Generation ──────────────────────────────────────────────

  /**
   * Generate the DESIGN_SYSTEM.md markdown document
   */
  generateDesignSystemMarkdown(data: DesignSystemData): string {
    const lines: string[] = [];

    lines.push(`# Design System — ${data.fileName}`);
    lines.push('');
    lines.push(`> Extracted from Figma on ${data.extractedAt}`);
    if (data.figmaUrl) {
      lines.push(`> Source: ${data.figmaUrl}`);
    }
    lines.push('');

    // ── Color Palette ──
    lines.push('## Color Palette');
    lines.push('');

    if (data.publishedColorStyles.length > 0) {
      lines.push('### Published Color Styles');
      lines.push('');
      lines.push('| Name | Hex | Opacity |');
      lines.push('|------|-----|---------|');
      for (const style of data.publishedColorStyles.sort((a, b) => a.name.localeCompare(b.name))) {
        lines.push(`| ${style.name} | \`${style.hex}\` | ${style.opacity === 1 ? '100%' : `${Math.round(style.opacity * 100)}%`} |`);
      }
      lines.push('');
    }

    if (data.rawColors.size > 0) {
      lines.push('### All Colors Found');
      lines.push('');
      lines.push('| Hex | Usage Count |');
      lines.push('|-----|-------------|');
      const sortedColors = [...data.rawColors.entries()].sort((a, b) => b[1] - a[1]);
      for (const [hex, count] of sortedColors) {
        lines.push(`| \`${hex}\` | ${count} |`);
      }
      lines.push('');
    }

    // ── Typography ──
    lines.push('## Typography');
    lines.push('');

    if (data.publishedTextStyles.length > 0) {
      lines.push('### Published Text Styles');
      lines.push('');
      lines.push('| Name | Font | Size | Weight | Line Height | Letter Spacing |');
      lines.push('|------|------|------|--------|-------------|----------------|');
      for (const style of data.publishedTextStyles.sort((a, b) => a.name.localeCompare(b.name))) {
        lines.push(`| ${style.name} | ${style.fontFamily} | ${style.fontSize}px | ${style.fontWeight} | ${style.lineHeight ? `${Math.round(style.lineHeight)}px` : '—'} | ${style.letterSpacing ? `${style.letterSpacing}px` : '—'} |`);
      }
      lines.push('');
    }

    if (data.rawTypography.size > 0) {
      lines.push('### All Typography Found');
      lines.push('');
      lines.push('| Font | Size | Weight | Line Height | Letter Spacing |');
      lines.push('|------|------|--------|-------------|----------------|');
      const sortedType = [...data.rawTypography.values()].sort((a, b) => (a.fontSize || 0) - (b.fontSize || 0));
      for (const t of sortedType) {
        lines.push(`| ${t.fontFamily} | ${t.fontSize}px | ${t.fontWeight} | ${t.lineHeight ? `${Math.round(t.lineHeight)}px` : '—'} | ${t.letterSpacing ? `${t.letterSpacing}px` : '—'} |`);
      }
      lines.push('');
    }

    // ── Shadows & Effects ──
    const hasEffects = data.publishedEffectStyles.length > 0 || data.rawEffects.length > 0;
    if (hasEffects) {
      lines.push('## Shadows & Effects');
      lines.push('');

      if (data.publishedEffectStyles.length > 0) {
        lines.push('### Published Effect Styles');
        lines.push('');
        lines.push('| Name | Type | Values |');
        lines.push('|------|------|--------|');
        for (const style of data.publishedEffectStyles) {
          for (const effect of style.effects) {
            const values = this.formatEffect(effect);
            lines.push(`| ${style.name} | ${effect.type} | ${values} |`);
          }
        }
        lines.push('');
      }

      if (data.rawEffects.length > 0) {
        lines.push('### All Effects Found');
        lines.push('');
        lines.push('| Type | Values |');
        lines.push('|------|--------|');
        for (const effect of data.rawEffects) {
          lines.push(`| ${effect.type} | ${this.formatEffect(effect)} |`);
        }
        lines.push('');
      }
    }

    // ── Themes ──
    if (data.themes && data.themes.collections.length > 0) {
      lines.push('## Themes');
      lines.push('');

      for (const collection of data.themes.collections) {
        lines.push(`### ${collection.name}`);
        lines.push(`Modes: ${collection.modes.join(', ')}`);
        lines.push('');

        // Group variables by type
        const colorVars = collection.variables.filter(v => v.type === 'COLOR');
        const otherVars = collection.variables.filter(v => v.type !== 'COLOR');

        if (colorVars.length > 0) {
          lines.push('#### Color Variables');
          lines.push('');
          const header = `| Variable | ${collection.modes.join(' | ')} |`;
          const divider = `|----------|${collection.modes.map(() => '-----').join('|')}|`;
          lines.push(header);
          lines.push(divider);
          for (const v of colorVars) {
            const values = collection.modes.map(m => `\`${v.valuesByMode[m] ?? '—'}\``).join(' | ');
            lines.push(`| ${v.name} | ${values} |`);
          }
          lines.push('');
        }

        if (otherVars.length > 0) {
          lines.push('#### Other Variables');
          lines.push('');
          const header = `| Variable | Type | ${collection.modes.join(' | ')} |`;
          const divider = `|----------|------|${collection.modes.map(() => '-----').join('|')}|`;
          lines.push(header);
          lines.push(divider);
          for (const v of otherVars) {
            const values = collection.modes.map(m => `${v.valuesByMode[m] ?? '—'}`).join(' | ');
            lines.push(`| ${v.name} | ${v.type} | ${values} |`);
          }
          lines.push('');
        }
      }
    }

    // ── Components ──
    if (data.components.length > 0) {
      lines.push('## Components');
      lines.push('');

      lines.push('### Component Inventory');
      lines.push('');
      lines.push('| Name | Page | Description | Variants |');
      lines.push('|------|------|-------------|----------|');
      for (const comp of data.components) {
        const desc = comp.description ? comp.description.substring(0, 60) + (comp.description.length > 60 ? '...' : '') : '—';
        const variants = comp.variants.length > 0 ? `${comp.variants.length} variants` : '—';
        const page = comp.group || '—';
        lines.push(`| ${comp.name} | ${page} | ${desc} | ${variants} |`);
      }
      lines.push('');

      // Component details for components with variants or properties
      const detailedComponents = data.components.filter(
        c => c.variants.length > 0 || Object.keys(c.properties).length > 0
      );

      if (detailedComponents.length > 0) {
        lines.push('### Component Details');
        lines.push('');

        for (const comp of detailedComponents) {
          lines.push(`#### ${comp.name}`);
          lines.push('');
          if (data.componentImages?.[comp.name]) {
            lines.push(`![${comp.name}](${data.componentImages[comp.name]})`);
            lines.push('');
          }
          if (comp.description) {
            lines.push(comp.description);
            lines.push('');
          }
          if (comp.variants.length > 0) {
            lines.push(`**Variants** (${comp.variants.length}):`);
            for (const v of comp.variants) {
              lines.push(`- ${v}`);
            }
            lines.push('');
          }
          if (Object.keys(comp.properties).length > 0) {
            lines.push('**Properties:**');
            lines.push('');
            lines.push('| Property | Type | Default |');
            lines.push('|----------|------|---------|');
            for (const [name, prop] of Object.entries(comp.properties)) {
              lines.push(`| ${name} | ${prop.type} | ${prop.defaultValue ?? '—'} |`);
            }
            lines.push('');
          }
          if (comp.styles) {
            if (comp.styles.colors.length > 0) {
              lines.push('**Colors used:**');
              lines.push(comp.styles.colors.map(c => `\`${c}\``).join(', '));
              lines.push('');
            }
            if (comp.styles.typography.length > 0) {
              lines.push('**Typography:**');
              lines.push('');
              lines.push('| Font | Size | Weight | Line Height |');
              lines.push('|------|------|--------|-------------|');
              for (const t of comp.styles.typography) {
                lines.push(`| ${t.fontFamily} | ${t.fontSize}px | ${t.fontWeight} | ${t.lineHeight ? `${Math.round(t.lineHeight)}px` : '—'} |`);
              }
              lines.push('');
            }
            if (comp.styles.spacing && (comp.styles.spacing.paddings.length > 0 || comp.styles.spacing.gaps.length > 0)) {
              lines.push('**Spacing:**');
              lines.push('');
              if (comp.styles.spacing.paddings.length > 0) {
                lines.push('| Top | Right | Bottom | Left |');
                lines.push('|-----|-------|--------|------|');
                for (const p of comp.styles.spacing.paddings) {
                  lines.push(`| ${p.top}px | ${p.right}px | ${p.bottom}px | ${p.left}px |`);
                }
                lines.push('');
              }
              if (comp.styles.spacing.gaps.length > 0) {
                lines.push(`Gaps: ${comp.styles.spacing.gaps.map(g => `\`${g}px\``).join(', ')}`);
                lines.push('');
              }
            }
            if (comp.styles.borders && (comp.styles.borders.radii.length > 0 || comp.styles.borders.strokeWeights.length > 0)) {
              lines.push('**Borders:**');
              lines.push('');
              if (comp.styles.borders.radii.length > 0) {
                const radiiStr = comp.styles.borders.radii.map(r =>
                  Array.isArray(r) ? `\`${r.join('/')}px\`` : `\`${r}px\``
                ).join(', ');
                lines.push(`Border radius: ${radiiStr}`);
                lines.push('');
              }
              if (comp.styles.borders.strokeWeights.length > 0) {
                lines.push(`Stroke weights: ${comp.styles.borders.strokeWeights.map(w => `\`${w}px\``).join(', ')}`);
                lines.push('');
              }
            }
            if (comp.styles.effects && comp.styles.effects.length > 0) {
              lines.push('**Effects:**');
              lines.push('');
              lines.push('| Type | Offset | Blur | Spread | Color |');
              lines.push('|------|--------|------|--------|-------|');
              for (const e of comp.styles.effects) {
                const offset = e.offset ? `${e.offset.x}, ${e.offset.y}` : '—';
                const color = e.color ? this.rgbToHex(e.color.r, e.color.g, e.color.b) : '—';
                lines.push(`| ${e.type} | ${offset} | ${e.radius ?? '—'} | ${e.spread ?? '—'} | \`${color}\` |`);
              }
              lines.push('');
            }
            if (comp.styles.layout && comp.styles.layout.length > 0) {
              lines.push('**Layout:**');
              lines.push('');
              for (const l of comp.styles.layout) {
                const parts = [l.mode];
                if (l.primaryAlign) parts.push(`main: ${l.primaryAlign}`);
                if (l.counterAlign) parts.push(`cross: ${l.counterAlign}`);
                lines.push(`- ${parts.join(', ')}`);
              }
              lines.push('');
            }
          }
        }
      }
    }

    // ── Grid System ──
    if (data.gridStyles.length > 0) {
      lines.push('## Grid System');
      lines.push('');
      lines.push('| Name | Type | Details |');
      lines.push('|------|------|---------|');
      for (const gridStyle of data.gridStyles) {
        for (const grid of gridStyle.grids) {
          const details = this.formatGrid(grid);
          lines.push(`| ${gridStyle.name} | ${grid.pattern} | ${details} |`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ─── Helper Methods ───────────────────────────────────────────────────

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private formatEffect(effect: any): string {
    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
      const x = effect.offset?.x ?? 0;
      const y = effect.offset?.y ?? 0;
      const blur = effect.radius ?? 0;
      const spread = effect.spread ?? 0;
      const color = effect.color
        ? `${this.rgbToHex(effect.color.r, effect.color.g, effect.color.b)}/${Math.round((effect.color.a ?? 1) * 100)}%`
        : '—';
      return `x:${x} y:${y} blur:${blur} spread:${spread} color:${color}`;
    }
    if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') {
      return `radius:${effect.radius ?? 0}`;
    }
    return JSON.stringify(effect);
  }

  private formatGrid(grid: any): string {
    if (grid.pattern === 'COLUMNS' || grid.pattern === 'ROWS') {
      return `count:${grid.count ?? '—'}, gutter:${grid.gutterSize ?? '—'}px, offset:${grid.offset ?? 0}px, alignment:${grid.alignment ?? '—'}`;
    }
    if (grid.pattern === 'GRID') {
      return `size:${grid.sectionSize ?? '—'}px`;
    }
    return JSON.stringify(grid);
  }

  /**
   * Retry logic for API calls
   */
  private async fetchWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (i === maxRetries - 1) throw error;

        if (error.response?.status === 429) {
          console.warn(`  Rate limited, waiting ${delay * (i + 1) * 2}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1) * 2));
        } else if (error.response?.status >= 500) {
          console.warn(`  Server error, retrying in ${delay * (i + 1)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        } else {
          throw error;
        }
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Handle API errors with helpful messages
   */
  private handleError(error: any) {
    console.error('\nError:', error.message);

    if (error.response?.status === 400) {
      console.error('\nBad Request — check that your Figma URL and access token are correct');
    } else if (error.response?.status === 403) {
      console.error('\nAccess Denied — check that your token has permission for this file');
    } else if (error.response?.status === 404) {
      console.error('\nFile Not Found — verify the Figma URL is correct');
    } else if (error.response?.status === 429) {
      console.error('\nRate Limit Exceeded — wait a few minutes and try again');
    }
  }

  // ─── Main Extraction Workflow ─────────────────────────────────────────

  /**
   * Complete extraction workflow
   */
  async extract() {
    console.log('Starting Figma extraction...\n');

    try {
      // 1. Fetch file data
      console.log('Fetching file data...');
      const fileData = await this.fetchFileData();
      const fileName = fileData.document.name;
      console.log(`File: ${fileName}\n`);

      // 2. Extract published styles
      console.log('Extracting published styles...');
      const publishedStyles = await this.extractPublishedStyles(fileData);
      console.log(`  Color styles: ${publishedStyles.colors.length}`);
      console.log(`  Text styles: ${publishedStyles.textStyles.length}`);
      console.log(`  Effect styles: ${publishedStyles.effectStyles.length}`);
      console.log(`  Grid styles: ${publishedStyles.gridStyles.length}`);

      // 3. Extract components
      console.log('\nExtracting components...');
      const { components, pageOrder } = this.extractComponents(fileData);
      console.log(`  Components: ${components.length}`);

      // 4. Extract raw tokens from node tree
      console.log('\nExtracting raw tokens from node tree...');
      const rawTokens = this.extractRawTokens(fileData);
      console.log(`  Colors: ${rawTokens.colors.size}`);
      console.log(`  Typography: ${rawTokens.typography.size}`);
      console.log(`  Effects: ${rawTokens.effects.length}`);

      // 5. Fetch theme variables
      console.log('\nFetching theme variables...');
      let themes: ThemeData | undefined;
      const variablesData = await this.fetchVariables();
      if (variablesData) {
        themes = this.extractThemes(variablesData);
        const totalVars = themes.collections.reduce((sum, c) => sum + c.variables.length, 0);
        console.log(`  Collections: ${themes.collections.length}`);
        for (const col of themes.collections) {
          console.log(`    "${col.name}" — ${col.modes.join(', ')} (${col.variables.length} variables)`);
        }
        if (themes.collections.length === 0) {
          console.log('  No variable collections found');
          themes = undefined;
        }
      } else {
        console.log('  Skipped (API not available)');
      }

      // 6. Get frames and download screenshots
      console.log('\nFinding frames...');
      const allFrames = this.getFrames(fileData);
      console.log(`  Found ${allFrames.length} frames`);

      const framesToDownload = allFrames.slice(0, 20); // Cap at 20
      let downloadedFrames: any[] = [];
      if (framesToDownload.length > 0) {
        console.log(`  Downloading ${framesToDownload.length} frame screenshots...`);
        downloadedFrames = await this.downloadFrameImages(framesToDownload);
      }

      // 7. Prepare output directory
      await fs.mkdir(this.config.outputDir, { recursive: true });

      // 8. Export component images and icon SVGs
      console.log('\nExporting component images...');
      const componentImages = await this.exportComponentImages(components);
      console.log(`  Exported ${Object.keys(componentImages).length} component PNGs`);

      console.log('\nExporting icon SVGs...');
      const iconSvgs = await this.exportIconSvgs(components);
      console.log(`  Exported ${Object.keys(iconSvgs).length} icon SVGs`);

      // 9. Generate DESIGN_SYSTEM.md
      console.log('\nGenerating DESIGN_SYSTEM.md...');
      const figmaUrl = this.config.figmaUrl || `https://www.figma.com/file/${this.config.fileKey}`;
      const extractedAt = new Date().toISOString().split('T')[0];

      const designSystemData: DesignSystemData = {
        fileName,
        figmaUrl,
        extractedAt,
        publishedColorStyles: publishedStyles.colors,
        publishedTextStyles: publishedStyles.textStyles,
        publishedEffectStyles: publishedStyles.effectStyles,
        rawColors: rawTokens.colors,
        rawTypography: rawTokens.typography,
        rawEffects: rawTokens.effects,
        components,
        gridStyles: publishedStyles.gridStyles,
        themes,
        componentImages,
        iconSvgs,
      };

      const markdown = this.generateDesignSystemMarkdown(designSystemData);
      const mdPath = path.join(this.config.outputDir, 'DESIGN_SYSTEM.md');
      await fs.writeFile(mdPath, markdown);
      console.log(`  Saved: ${mdPath}`);

      // 10. Save raw design tokens as JSON (for programmatic use)
      const tokensJson: Record<string, any> = {
        colors: Object.fromEntries(rawTokens.colors),
        typography: Object.fromEntries(rawTokens.typography),
        effects: rawTokens.effects,
        publishedStyles: {
          colors: publishedStyles.colors,
          textStyles: publishedStyles.textStyles,
          effectStyles: publishedStyles.effectStyles,
          gridStyles: publishedStyles.gridStyles,
        },
        components: components.map(c => ({
          name: c.name,
          description: c.description,
          nodeId: c.nodeId,
          group: c.group || null,
          variantCount: c.variants.length,
          variants: c.variants,
          properties: c.properties,
          image: componentImages[c.name] || null,
          styles: c.styles || null,
        })),
        themes: themes || null,
        componentImages,
        iconSvgs,
        pageOrder,
      };

      const tokensPath = path.join(this.config.outputDir, 'design-tokens.json');
      await fs.writeFile(tokensPath, JSON.stringify(tokensJson, null, 2));
      console.log(`  Saved: ${tokensPath}`);

      // 11. Save manifest
      const manifest = {
        fileKey: this.config.fileKey,
        fileName,
        figmaUrl,
        extractedAt: new Date().toISOString(),
        frames: downloadedFrames,
        counts: {
          publishedColorStyles: publishedStyles.colors.length,
          publishedTextStyles: publishedStyles.textStyles.length,
          publishedEffectStyles: publishedStyles.effectStyles.length,
          publishedComponents: components.length,
          rawColors: rawTokens.colors.size,
          rawTypography: rawTokens.typography.size,
          themeCollections: themes?.collections.length ?? 0,
          componentImages: Object.keys(componentImages).length,
          iconSvgs: Object.keys(iconSvgs).length,
        },
      };

      const manifestPath = path.join(this.config.outputDir, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`  Saved: ${manifestPath}`);

      console.log('\nExtraction complete!\n');

      return manifest;
    } catch (error: any) {
      this.handleError(error);
      throw error;
    }
  }
}

export default FigmaExtractor;
