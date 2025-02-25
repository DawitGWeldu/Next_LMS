import { v4 as uuidv4 } from 'uuid';

export const TEST_USERS = {
  student: {
    phone: '+251994697123',
    password: '123456',
    name: '[TEST] Student User'
  },
  teacher: {
    phone: '+251994697124',
    password: '123456',
    name: '[TEST] Teacher User'
  }
};

export const TEST_COURSES = {
  free: {
    id: uuidv4(),
    title: '[TEST] Free Test Course',
    description: '<p>A comprehensive free course for testing purposes. This course covers all the basics.</p>',
    price: 0,
    imageUrl: 'https://utfs.io/f/95f1443d-19a1-42dd-959a-1ebe572fc16a-ibclwm.jpg',
    isPublished: true,
    categoryId: 'aaea2f05-9b6b-4805-a0e8-bb0a24ab032e'
  },
  paid: {
    id: uuidv4(),
    title: '[TEST] Paid Test Course',
    description: '<p>An advanced paid course for testing. Includes premium content and exercises.</p><ul><li>Feature 1</li><li>Feature 2</li></ul>',
    price: 2000,
    imageUrl: 'https://utfs.io/f/95f1443d-19a1-42dd-959a-1ebe572fc16a-ibclwm.jpg',
    isPublished: true,
    categoryId: 'aaea2f05-9b6b-4805-a0e8-bb0a24ab032e'
  }
};

export const TEST_CHAPTERS = {
  published: {
    id: uuidv4(),
    title: '[TEST] Published Chapter',
    description: '<p>A comprehensive chapter covering important topics.</p><ul><li>Topic 1</li><li>Topic 2</li><li>Topic 3</li></ul>',
    videoUrl: 'https://utfs.io/f/97dd7361-a64a-4879-8a43-b8c3bc1a29ea-l47lyn.mp4',
    position: 1,
    isPublished: true,
    isFree: false,
    muxData: {
      id: uuidv4(),
      assetId: 'qnBXOtjL8H01RgGn7hQGWZNYrrJHn02NB8GGxNF00U02OuA',
      playbackId: 'GYWx00yVd028KHDYjvKCtojkdIdID95UvneLxOC1il702o'
    }
  },
  free: {
    id: uuidv4(),
    title: '[TEST] Free Preview Chapter',
    description: '<p>A free preview chapter to demonstrate the course quality.</p><ul><li>Introduction</li><li>Basic concepts</li></ul>',
    videoUrl: 'https://utfs.io/f/97dd7361-a64a-4879-8a43-b8c3bc1a29ea-l47lyn.mp4',
    position: 2,
    isPublished: true,
    isFree: true,
    muxData: {
      id: uuidv4(),
      assetId: 'qnBXOtjL8H01RgGn7hQGWZNYrrJHn02NB8GGxNF00U02OuA',
      playbackId: 'GYWx00yVd028KHDYjvKCtojkdIdID95UvneLxOC1il702o'
    }
  }
}; 