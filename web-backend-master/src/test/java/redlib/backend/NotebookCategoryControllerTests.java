package redlib.backend;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import redlib.backend.dto.NotebookCategoryDTO;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class NotebookCategoryControllerTests extends NotebookTestSupport {
    @Test
    void shouldValidateDuplicateNamesPerUserOnly() throws Exception {
        Cookie alice = loginAsAlice();
        addCategory(alice, "学习");

        JsonNode duplicate = json(mockMvc.perform(post("/api/notebook/categories/add")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NotebookCategoryDTO() {{
                            setName("学习");
                        }})))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(duplicate.path("success").asBoolean()).isFalse();

        Cookie bob = loginAsBob();
        JsonNode otherUserAdd = json(mockMvc.perform(post("/api/notebook/categories/add")
                        .cookie(bob)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NotebookCategoryDTO() {{
                            setName("学习");
                        }})))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(otherUserAdd.path("success").asBoolean()).isTrue();
    }

    @Test
    void shouldDeleteCategoryWithoutDeletingTheNote() throws Exception {
        Cookie alice = loginAsAlice();
        Integer categoryId = addCategory(alice, "临时分类");
        Integer noteId = addNote(alice, "保留笔记", "删除分类后笔记仍在", List.of(categoryId));

        JsonNode deleteResult = json(mockMvc.perform(post("/api/notebook/categories/delete")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(List.of(categoryId))))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(deleteResult.path("success").asBoolean()).isTrue();

        JsonNode note = getNote(alice, noteId);
        assertThat(note.path("success").asBoolean()).isTrue();
        assertThat(note.path("data").path("title").asText()).isEqualTo("保留笔记");
        assertThat(note.path("data").path("categories").size()).isZero();
    }
}
