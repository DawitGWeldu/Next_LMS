/**
 * MIME type map for common file extensions
 */
const Mimes = {
  // HTML
  html: "text/html",
  htm: "text/html",
  
  // JavaScript
  js: "text/javascript",
  mjs: "text/javascript",
  
  // CSS
  css: "text/css",
  
  // JSON
  json: "application/json",
  
  // XML
  xml: "application/xml",
  xsd: "application/xml",
  
  // Text
  txt: "text/plain",
  log: "text/plain",
  
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  
  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  
  // Fonts
  ttf: "font/ttf",
  woff: "font/woff",
  woff2: "font/woff2",
  eot: "application/vnd.ms-fontobject",
  
  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  
  // Archives
  zip: "application/zip",
  rar: "application/vnd.rar",
  tar: "application/x-tar",
  gz: "application/gzip",
  
  // Others
  swf: "application/x-shockwave-flash"
}; 

// Make available globally for service worker
self.Mimes = Mimes; 