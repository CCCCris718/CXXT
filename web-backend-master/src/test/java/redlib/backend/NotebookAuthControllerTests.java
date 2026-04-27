package redlib.backend;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import redlib.backend.dto.NotebookLoginDTO;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class NotebookAuthControllerTests extends NotebookTestSupport {
    @Test
    void shouldLoginReadCurrentUserAndLogout() throws Exception {
        Cookie cookie = loginAsAlice();

        JsonNode currentUser = json(mockMvc.perform(get("/api/notebook/auth/currentUser").cookie(cookie))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(currentUser.path("success").asBoolean()).isTrue();
        assertThat(currentUser.path("data").path("userCode").asText()).isEqualTo("alice0");
        assertThat(currentUser.path("data").path("accountType").asText()).isEqualTo("NOTEBOOK_USER");

        mockMvc.perform(get("/api/notebook/auth/logout").cookie(cookie))
                .andExpect(status().isOk());

        JsonNode afterLogout = json(mockMvc.perform(get("/api/notebook/auth/currentUser").cookie(cookie))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(afterLogout.path("success").asBoolean()).isFalse();
    }

    @Test
    void shouldRejectWrongPassword() throws Exception {
        NotebookLoginDTO loginDTO = new NotebookLoginDTO();
        loginDTO.setUsername("alice0");
        loginDTO.setPassword("wrong-password");

        JsonNode result = json(mockMvc.perform(post("/api/notebook/auth/login")
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginDTO)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(result.path("success").asBoolean()).isFalse();
        assertThat(result.path("message").asText()).contains("Invalid username or password");
    }

    @Test
    void shouldRegisterAndLoginNewUser() throws Exception {
        JsonNode registerResult = register("charlie", "123456", "123456", true);
        assertThat(registerResult.path("success").asBoolean()).isTrue();
        assertThat(registerResult.path("data").asInt()).isPositive();

        Cookie cookie = login("charlie", "123456");
        JsonNode currentUser = json(mockMvc.perform(get("/api/notebook/auth/currentUser").cookie(cookie))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(currentUser.path("success").asBoolean()).isTrue();
        assertThat(currentUser.path("data").path("userCode").asText()).isEqualTo("charlie");
        assertThat(currentUser.path("data").path("userName").asText()).isEqualTo("charlie");
    }

    @Test
    void shouldRejectInvalidRegistrationRequests() throws Exception {
        JsonNode duplicateUsername = register("alice0", "123456", "123456", true);
        assertThat(duplicateUsername.path("success").asBoolean()).isFalse();
        assertThat(duplicateUsername.path("message").asText()).contains("用户名已被占用");

        JsonNode shortPassword = register("short-pass", "12345", "12345", true);
        assertThat(shortPassword.path("success").asBoolean()).isFalse();
        assertThat(shortPassword.path("message").asText()).contains("密码长度不能少于 6 位");

        JsonNode mismatchedPassword = register("mismatch", "123456", "654321", true);
        assertThat(mismatchedPassword.path("success").asBoolean()).isFalse();
        assertThat(mismatchedPassword.path("message").asText()).contains("两次输入的密码不一致");

        JsonNode missingAgreement = register("terms-missing", "123456", "123456", false);
        assertThat(missingAgreement.path("success").asBoolean()).isFalse();
        assertThat(missingAgreement.path("message").asText()).contains("须同意用户协议与隐私政策");
    }

    @Test
    void shouldVerifyCurrentPasswordAndChangePassword() throws Exception {
        Cookie cookie = loginAsAlice();
        mockMvc.perform(post("/api/notebook/auth/verifyCurrentPassword")
                        .cookie(cookie)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("password", "123456"))))
                .andExpect(status().isOk());
        Map<String, String> change = Map.of(
                "oldPassword", "123456",
                "newPassword", "abcdef",
                "confirmNewPassword", "abcdef");
        mockMvc.perform(post("/api/notebook/auth/changePassword")
                        .cookie(cookie)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(change)))
                .andExpect(status().isOk());
        login("alice0", "abcdef");
    }
}
