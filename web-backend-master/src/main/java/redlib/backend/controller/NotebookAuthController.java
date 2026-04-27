package redlib.backend.controller;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import redlib.backend.annotation.NeedNoPrivilege;
import redlib.backend.annotation.Privilege;
import redlib.backend.dto.NotebookChangeIdDTO;
import redlib.backend.dto.NotebookChangePasswordDTO;
import redlib.backend.dto.NotebookLoginDTO;
import redlib.backend.dto.NotebookRegisterDTO;
import redlib.backend.dto.NotebookVerifyPasswordDTO;
import redlib.backend.model.Token;
import redlib.backend.service.NotebookAuthService;
import redlib.backend.service.TokenService;

@RestController
@RequestMapping("/api/notebook/auth")
public class NotebookAuthController {
    @Autowired
    private NotebookAuthService notebookAuthService;

    @Autowired
    private TokenService tokenService;

    @PostMapping("login")
    @NeedNoPrivilege
    public Token login(@RequestBody NotebookLoginDTO loginDTO, HttpServletRequest request, HttpServletResponse response) {
        String ipAddress = request.getRemoteAddr();
        ipAddress = ipAddress.replace("[", "").replace("]", "");
        Token token = notebookAuthService.login(loginDTO.getUsername(), loginDTO.getPassword(), ipAddress, request.getHeader("user-agent"));
        Cookie cookie = new Cookie("accessToken", token.getAccessToken());
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        response.addCookie(cookie);
        return token;
    }

    @PostMapping("register")
    @NeedNoPrivilege
    public Integer register(@RequestBody NotebookRegisterDTO registerDTO) {
        return notebookAuthService.register(
                registerDTO.getUsername(),
                registerDTO.getPassword(),
                registerDTO.getConfirmPassword(),
                registerDTO.getAgreeToTerms());
    }

    @GetMapping("currentUser")
    @Privilege
    public Token currentUser() {
        return notebookAuthService.currentUser();
    }

    @PostMapping("changeNotebookId")
    @Privilege
    public Token changeNotebookId(@RequestBody NotebookChangeIdDTO body) {
        return notebookAuthService.changeNotebookId(body.getNewNotebookId(), body.getPassword());
    }

    @PostMapping("verifyCurrentPassword")
    @Privilege
    public void verifyCurrentPassword(@RequestBody NotebookVerifyPasswordDTO body) {
        notebookAuthService.verifyCurrentPassword(body.getPassword());
    }

    @PostMapping("changePassword")
    @Privilege
    public void changePassword(@RequestBody NotebookChangePasswordDTO body) {
        notebookAuthService.changePassword(
                body.getOldPassword(), body.getNewPassword(), body.getConfirmNewPassword());
    }

    @GetMapping("logout")
    @Privilege
    public void logout() {
        tokenService.logout(notebookAuthService.currentUser().getAccessToken());
    }
}
