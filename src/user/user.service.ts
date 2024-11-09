// src/user/user.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddCourseDto } from './dto/add-course.dto';
import {
  UserWithCourseAnalysis,
  CourseWithPrerequisiteStatus,
} from './user.interface';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: createUserDto,
    });
  }

  async findAll(): Promise<UserWithCourseAnalysis[]> {
    const users = await this.prisma.user.findMany({
      include: { Has: { include: { Course: true } } },
    });

    const result: UserWithCourseAnalysis[] = [];

    for (const user of users) {
      const courseCodes = user.Has.map((has) => has.Course.code);
      const courses = user.Has.map((has) => has.Course);
      const courseAnalysis: CourseWithPrerequisiteStatus[] = [];

      for (const course of courses) {
        const prereqs = await this.prisma.preReq.findMany({
          where: { courseCode: course.code },
        });

        const prereqCodes = prereqs.map((pr) => pr.preReqCode);

        const hasPrereqs = prereqCodes.every((prCode) =>
          courseCodes.includes(prCode),
        );

        const missingPrereqs = prereqCodes.filter(
          (prCode) => !courseCodes.includes(prCode),
        );

        courseAnalysis.push({
          code: course.code,
          credits: course.credits,
          prerequisitesFulfilled: hasPrereqs,
          ...(hasPrereqs ? {} : { missingPrerequisites: missingPrereqs }),
        });
      }

      result.push({
        id: user.id,
        name: user.name,
        courses: courseAnalysis,
      });
    }

    return result;
  }

  async findOne(id: number): Promise<UserWithCourseAnalysis> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { Has: { include: { Course: true } } },
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    const courseCodes = user.Has.map((has) => has.Course.code);
    const courses = user.Has.map((has) => has.Course);
    const courseAnalysis: CourseWithPrerequisiteStatus[] = [];

    for (const course of courses) {
      const prereqs = await this.prisma.preReq.findMany({
        where: { courseCode: course.code },
      });

      const prereqCodes = prereqs.map((pr) => pr.preReqCode);

      const hasPrereqs = prereqCodes.every((prCode) =>
        courseCodes.includes(prCode),
      );

      const missingPrereqs = prereqCodes.filter(
        (prCode) => !courseCodes.includes(prCode),
      );

      courseAnalysis.push({
        code: course.code,
        credits: course.credits,
        prerequisitesFulfilled: hasPrereqs,
        ...(hasPrereqs ? {} : { missingPrerequisites: missingPrereqs }),
      });
    }

    return {
      id: user.id,
      name: user.name,
      courses: courseAnalysis,
    };
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
  }

  async remove(id: number) {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async addCourseToUser(userId: number, courseCode: string) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { Has: { include: { Course: true } } },
    });

    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    // Check if course exists
    const course = await this.prisma.course.findUnique({
      where: { code: courseCode },
    });

    if (!course)
      throw new NotFoundException(`Course with code ${courseCode} not found`);

    // Check if user already has the course
    const existingHas = await this.prisma.has.findUnique({
      where: {
        courseCode_userId: {
          courseCode,
          userId,
        },
      },
    });

    if (existingHas) {
      throw new BadRequestException(`User already has course ${courseCode}`);
    }

    // Get prerequisites for the course
    const prereqs = await this.prisma.preReq.findMany({
      where: { courseCode },
    });

    const prereqCodes = prereqs.map((pr) => pr.preReqCode);

    // Check if user has all prerequisites
    const userCourseCodes = user.Has.map((has) => has.Course.code);
    const missingPrereqs = prereqCodes.filter(
      (prCode) => !userCourseCodes.includes(prCode),
    );

    if (missingPrereqs.length > 0) {
      throw new BadRequestException({
        message: `Missing prerequisites for course ${courseCode}`,
        missingPrerequisites: missingPrereqs,
      });
    }

    // Add the course to the user
    const addedCourse = await this.prisma.has.create({
      data: {
        courseCode,
        userId,
      },
    });

    return addedCourse;
  }
}
