/**
 * Tiny XML parser for service worker
 * Simplified version for parsing SCORM manifests
 * @returns {Object} XML parsing utility
 */
function txml() {
  /**
   * Parse XML string into a document object
   * @param {string} xmlString - XML content as string
   * @returns {Array} Parsed XML as an array of nodes
   */
  function parse(xmlString) {
    // Prepare string - trim and remove comments
    xmlString = xmlString.trim()
      .replace(/<!--[\s\S]*?-->/g, '');
    
    // Parse the document
    return parseNode(xmlString);
  }
  
  /**
   * Parse a node from XML string
   * @param {string} xmlString - XML string to parse
   * @returns {Array} Array of parsed nodes
   */
  function parseNode(xmlString) {
    const nodes = [];
    const regex = /<(\/?)([a-zA-Z0-9:_.-]+)((?:\s+[a-zA-Z0-9:_.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
    let lastIndex = 0;
    let match;
    
    // Process each XML tag
    while ((match = regex.exec(xmlString)) !== null) {
      const fullMatch = match[0];
      const isClosing = match[1] === '/';
      const tagName = match[2];
      const attributes = parseAttributes(match[3] || '');
      const isSelfClosing = match[4] === '/' || isClosing;
      
      // Handle text content before the tag
      if (match.index > lastIndex) {
        const textContent = xmlString.substring(lastIndex, match.index).trim();
        if (textContent) {
          nodes.push({ type: 'text', content: textContent });
        }
      }
      
      // Handle element nodes
      if (!isClosing) {
        if (isSelfClosing) {
          // Self-closing tag
          nodes.push({
            type: 'element',
            tagName,
            attributes,
            children: []
          });
        } else {
          // Opening tag - find matching closing tag
          const innerStartIndex = regex.lastIndex;
          const innerEndIndex = findClosingTag(xmlString, tagName, innerStartIndex);
          
          if (innerEndIndex !== -1) {
            const innerContent = xmlString.substring(innerStartIndex, innerEndIndex);
            const children = parseNode(innerContent);
            
            nodes.push({
              type: 'element',
              tagName,
              attributes,
              children
            });
            
            // Skip the processed inner content
            regex.lastIndex = innerEndIndex + tagName.length + 3; // </tagName>
          }
        }
      }
      
      lastIndex = regex.lastIndex;
    }
    
    // Handle any remaining text
    if (lastIndex < xmlString.length) {
      const textContent = xmlString.substring(lastIndex).trim();
      if (textContent) {
        nodes.push({ type: 'text', content: textContent });
      }
    }
    
    return nodes;
  }
  
  /**
   * Find closing tag index
   * @param {string} xml - XML string
   * @param {string} tagName - Tag name to find closing for
   * @param {number} startIndex - Starting search index
   * @returns {number} Index of closing tag or -1 if not found
   */
  function findClosingTag(xml, tagName, startIndex) {
    const closeTagRegex = new RegExp(`<\\/${tagName}>`, 'g');
    closeTagRegex.lastIndex = startIndex;
    const match = closeTagRegex.exec(xml);
    return match ? match.index : -1;
  }
  
  /**
   * Parse attributes from tag
   * @param {string} attributeString - String containing attributes
   * @returns {Object} Map of attribute names to values
   */
  function parseAttributes(attributeString) {
    const attributes = {};
    const regex = /([a-zA-Z0-9:_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match;
    
    while ((match = regex.exec(attributeString)) !== null) {
      const name = match[1];
      const value = match[2] !== undefined ? match[2] : match[3];
      attributes[name] = value;
    }
    
    return attributes;
  }
  
  /**
   * Simplify parsed XML to a more usable object structure
   * @param {Array} nodes - Array of parsed nodes
   * @returns {Object} Simplified object representation
   */
  function simplify(nodes) {
    const result = {};
    
    for (const node of nodes) {
      if (node.type === 'element') {
        // Process element node
        const obj = {};
        
        // Add attributes
        Object.assign(obj, node.attributes);
        
        // Process children
        if (node.children.length > 0) {
          const hasOnlyTextChildren = node.children.every(child => child.type === 'text');
          
          if (hasOnlyTextChildren) {
            // For text-only children, just use the text content
            obj._ = node.children[0].content;
          } else {
            // For mixed content, recursively simplify
            const children = simplify(node.children);
            Object.assign(obj, children);
          }
        }
        
        // Add to result
        if (result[node.tagName]) {
          // Convert to array if duplicate tag
          if (!Array.isArray(result[node.tagName])) {
            result[node.tagName] = [result[node.tagName]];
          }
          result[node.tagName].push(obj);
        } else {
          result[node.tagName] = obj;
        }
      }
    }
    
    return result;
  }
  
  // Return public API
  return {
    parse,
    simplify
  };
} 