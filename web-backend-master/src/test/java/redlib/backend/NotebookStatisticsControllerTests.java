package redlib.backend;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class NotebookStatisticsControllerTests extends NotebookTestSupport {
    @Test
    void shouldCountNotesPerCategoryForCurrentUserOnly() throws Exception {
        Cookie alice = loginAsAlice();
        Integer study = addCategory(alice, "学习");
        Integer life = addCategory(alice, "生活");
        addNote(alice, "高数复习", "第一章", List.of(study, life));
        addNote(alice, "英语背词", "第二章", List.of(study));

        Cookie bob = loginAsBob();
        Integer bobStudy = addCategory(bob, "学习");
        addNote(bob, "Bob笔记", "只属于Bob", List.of(bobStudy));

        JsonNode stats = json(mockMvc.perform(get("/api/notebook/statistics/categoryCounts").cookie(alice))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(stats.path("success").asBoolean()).isTrue();
        int studyCount = 0;
        int lifeCount = 0;
        for (JsonNode item : stats.path("data")) {
            if ("学习".equals(item.path("categoryName").asText())) {
                studyCount = item.path("noteCount").asInt();
            }
            if ("生活".equals(item.path("categoryName").asText())) {
                lifeCount = item.path("noteCount").asInt();
            }
        }
        assertThat(studyCount).isEqualTo(2);
        assertThat(lifeCount).isEqualTo(1);
    }
}
