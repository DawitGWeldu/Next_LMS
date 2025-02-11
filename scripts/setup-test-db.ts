const { PrismaClient } = require('@prisma/client');

const TEST_USERS = {
  student: {
    phone: '0994697123',
    password: '123456'
  },
  teacher: {
    phone: '0994697124',
    password: '123456'
  }
};

const prisma_test = new PrismaClient();

async function main() {
  try {
    // Clean existing test data
    await prisma_test.purchase.deleteMany({
      where: { userId: { startsWith: 'test-' } }
    });
    await prisma_test.chapaTransaction.deleteMany({
      where: { userId: { startsWith: 'test-' } }
    });
    await prisma_test.course.deleteMany({
      where: { userId: { startsWith: 'test-' } }
    });
    await prisma_test.user.deleteMany({
      where: { id: { startsWith: 'test-' } }
    });

    // Create test users
    const student = await prisma_test.user.create({
      data: {
        id: 'test-student-id',
        phoneNumber: TEST_USERS.student.phone,
        password: TEST_USERS.student.password,
        role: 'USER'
      }
    });

    const teacher = await prisma_test.user.create({
      data: {
        id: 'test-teacher-id',
        phoneNumber: TEST_USERS.teacher.phone,
        password: TEST_USERS.teacher.password,
        role: 'TEACHER'
      }
    });

    console.log('Test database setup complete:', {
      student: student.id,
      teacher: teacher.id
    });
  } catch (error) {
    console.error('Error setting up test database:', error);
    process.exit(1);
  } finally {
    await prisma_test.$disconnect();
  }
}

main(); 