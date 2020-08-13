import {
	Body,
	Controller,
	Delete,
	Get,
	InternalServerErrorException,
	NotFoundException,
	Param,
	Patch,
	Post,
	Put,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { MetaverseAuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import { CurrentUser } from "../auth/user.decorator";
import { MulterFile } from "../common/multer-file.model";
import { renderDomain } from "../common/utils";
import { SessionService } from "../session/session.service";
import { User } from "../user/user.schema";
import {
	CreateDomainDto,
	UpdateDomainDto,
	UpdateDomainImageDto,
} from "./domain.dto";
import { DomainService } from "./domain.service";

@ApiTags("user domains")
@Controller("api/user")
export class UserDomainController {
	constructor(
		private authService: AuthService,
		private domainService: DomainService,
		private sessionService: SessionService,
	) {}

	@Post("domain")
	@ApiBearerAuth()
	@UseGuards(MetaverseAuthGuard)
	async createDomain(
		@CurrentUser() user: User,
		@Body() createDomainDto: CreateDomainDto,
	) {
		const domain = await this.domainService.createDomain(
			user,
			createDomainDto,
		);

		return renderDomain(domain, null, user);
	}

	@Post("domain/:id/token")
	@ApiBearerAuth()
	@UseGuards(MetaverseAuthGuard)
	async newToken(@CurrentUser() user: User, @Param("id") id: string) {
		if (!(user.domains as any[]).includes(id))
			throw new NotFoundException();

		const domain = await this.domainService.findById(id);
		if (domain == null) throw new NotFoundException();

		const token = await this.authService.newDomainToken(user, domain);
		return { token };
	}

	@Get("domains")
	@ApiBearerAuth()
	@UseGuards(MetaverseAuthGuard)
	async getAllUserDomains(@CurrentUser() user: User) {
		await user.populate("domains").execPopulate();

		return Promise.all(
			user.domains
				.sort((a, b) => +b.lastUpdated - +a.lastUpdated)
				.map(async domain => {
					domain.author = user; // populate

					const session = await this.sessionService.findDomainById(
						domain.id,
					);

					return renderDomain(domain, session, user);
				}),
		);
	}

	@Patch("domain/:id")
	@ApiBearerAuth()
	@UseGuards(MetaverseAuthGuard)
	async updateDomain(
		@CurrentUser() user: User,
		@Param("id") id: string,
		@Body() updateDomainDto: UpdateDomainDto,
	) {
		if (!(user.domains as any[]).includes(id))
			throw new NotFoundException();

		const domain = await this.domainService.findById(id);

		const updatedDomain = await this.domainService.updateDomain(
			domain,
			updateDomainDto,
			true,
		);
		updatedDomain.author = user;

		const session = await this.sessionService.findDomainById(domain.id);

		return renderDomain(updatedDomain, session, user);
	}

	@Delete("domain/:id")
	@ApiBearerAuth()
	@UseGuards(MetaverseAuthGuard)
	async deleteDomain(@CurrentUser() user: User, @Param("id") id: string) {
		if (!(user.domains as any[]).includes(id))
			throw new NotFoundException();

		return this.domainService.deleteDomain(id);
	}

	@Put("domain/:id/image")
	@ApiBearerAuth()
	@ApiConsumes("multipart/form-data")
	@ApiBody({
		description: "Update domain thumbnail",
		type: UpdateDomainImageDto,
	})
	@UseGuards(MetaverseAuthGuard)
	@UseInterceptors(
		FileInterceptor("image", {
			limits: {
				fileSize: 1000 * 1000 * 8, // 8mb
			},
		}),
	)
	async updateDomainImage(
		@CurrentUser() user: User,
		@UploadedFile() file: MulterFile,
		@Param("id") id: string,
	) {
		if (file == null)
			throw new InternalServerErrorException("Image not received");

		if (!(user.domains as any[]).includes(id))
			throw new NotFoundException();

		const domain = await this.domainService.findById(id);
		if (domain == null) throw new NotFoundException();

		return this.domainService.changeDomainImage(domain, file);
	}
}
