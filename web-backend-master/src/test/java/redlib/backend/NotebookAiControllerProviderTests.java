package redlib.backend;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import redlib.backend.config.NotebookAiProperties;
import redlib.backend.dto.NotebookSummarizeRequestDTO;
import redlib.backend.dto.NotebookTranslateRequestDTO;
import redlib.backend.service.ai.NotebookAiProvider;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "notebook.ai.enabled=true",
        "notebook.ai.provider=fake",
        "notebook.ai.max-audio-size-bytes=1048576"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@Import(NotebookAiControllerProviderTests.FakeAiProviderConfig.class)
class NotebookAiControllerProviderTests extends NotebookTestSupport {
    @Test
    void shouldUseConfiguredAiProvider() throws Exception {
        Cookie alice = loginAsAlice();

        NotebookTranslateRequestDTO translateDTO = new NotebookTranslateRequestDTO();
        translateDTO.setText("hello");
        translateDTO.setTargetLanguage("zh");
        JsonNode translated = json(mockMvc.perform(post("/api/notebook/ai/translate")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(translateDTO)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(translated.path("data").path("text").asText()).isEqualTo("translated:zh:hello");

        NotebookSummarizeRequestDTO summarizeDTO = new NotebookSummarizeRequestDTO();
        summarizeDTO.setText("this is a long note");
        summarizeDTO.setMaxLength(8);
        JsonNode summarized = json(mockMvc.perform(post("/api/notebook/ai/summarize")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(summarizeDTO)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(summarized.path("data").path("text").asText()).isEqualTo("summary:8:this is a long note");

        MockMultipartFile file = new MockMultipartFile("file", "memo.wav", "audio/wav", "voice".getBytes(StandardCharsets.UTF_8));
        JsonNode transcribed = json(mockMvc.perform(multipart("/api/notebook/ai/transcribe")
                        .file(file)
                        .cookie(alice)
                        .param("language", "zh"))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(transcribed.path("data").path("text").asText()).isEqualTo("transcribed:zh:memo.wav");
    }

    @TestConfiguration
    static class FakeAiProviderConfig {
        @Bean
        NotebookAiProvider fakeNotebookAiProvider() {
            return new NotebookAiProvider() {
                @Override
                public String getProviderName() {
                    return "fake";
                }

                @Override
                public String translate(String text, String sourceLanguage, String targetLanguage, NotebookAiProperties properties) {
                    return "translated:" + targetLanguage + ":" + text;
                }

                @Override
                public String summarize(String text, Integer maxLength, NotebookAiProperties properties) {
                    return "summary:" + maxLength + ":" + text;
                }

                @Override
                public String transcribe(org.springframework.web.multipart.MultipartFile file, String language, NotebookAiProperties properties) {
                    return "transcribed:" + language + ":" + file.getOriginalFilename();
                }
            };
        }
    }
}
