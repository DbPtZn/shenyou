import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** 注册：手机号或邮箱 + 密码（格式校验在 Service 层，属业务规则） */
export class RegisterDto {
  @IsString({ message: "账号不能为空" })
  @IsNotEmpty({ message: "账号不能为空" })
  account!: string;

  @IsString()
  @MinLength(8, { message: "密码长度至少 8 位" })
  @MaxLength(64, { message: "密码长度不能超过 64 位" })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: "昵称最长 32 个字符" })
  nickname?: string;
}

export class LoginDto {
  @IsString({ message: "账号不能为空" })
  @IsNotEmpty({ message: "账号不能为空" })
  account!: string;

  @IsString({ message: "密码不能为空" })
  @IsNotEmpty({ message: "密码不能为空" })
  password!: string;
}

export class RefreshTokenDto {
  @IsString({ message: "refreshToken 不能为空" })
  @IsNotEmpty({ message: "refreshToken 不能为空" })
  refreshToken!: string;
}
