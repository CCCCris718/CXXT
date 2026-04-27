package redlib.backend;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import redlib.backend.dto.NotebookTranslateRequestDTO;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class NotebookAiControllerDisabledTests extends NotebookTestSupport {
    @Test
    void shouldRejectAiCallWhenProviderIsDisabled() throws Exception {
        Cookie alice = loginAsAlice();
        NotebookTranslateRequestDTO requestDTO = new NotebookTranslateRequestDTO();
        requestDTO.setText("hello");
        requestDTO.setTargetLanguage("zh");

        JsonNode response = json(mockMvc.perform(post("/api/notebook/ai/translate")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(requestDTO)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(response.path("success").asBoolean()).isFalse();
        assertThat(response.path("message").asText()).contains("AI");
    }
}
