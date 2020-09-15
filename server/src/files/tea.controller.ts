import {
	Controller,
	Get,
	ImATeapotException,
	Post,
	Req,
	Res,
} from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { TEA_URL, URL as METAVERSE_URL } from "../environment";
import { TeaService } from "./tea.service";

@Controller({
	host: new URL(TEA_URL).hostname,
})
@ApiTags("user files over tea")
export class TeaController {
	constructor(private readonly teaService: TeaService) {}

	@Get("*")
	@ApiExcludeEndpoint()
	redirect(@Res() res: Response) {
		return res.redirect(METAVERSE_URL);
	}

	@Post("*")
	@ApiExcludeEndpoint()
	getFile(@Req() req: Request, @Res() res: Response) {
		try {
			return this.teaService.getFile(req, res);
		} catch (err) {
			throw new ImATeapotException();
		}
	}
}
