package redlib.backend.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import redlib.backend.model.NotebookNote;

import java.util.List;

@Mapper
public interface NotebookNoteMapper extends BaseMapper<NotebookNote> {
    @Select("""
            <script>
            select count(distinct n.id)
            from note n
            <if test="categoryId != null">
                inner join note_category nc on nc.note_id = n.id
            </if>
            where n.user_id = #{userId}
            <if test="keyword != null and keyword != ''">
                and (
                    n.title like concat('%', #{keyword}, '%')
                    or n.content like concat('%', #{keyword}, '%')
                )
            </if>
            <if test="categoryId != null">
                and nc.category_id = #{categoryId}
            </if>
            </script>
            """)
    Integer countByQuery(
            @Param("userId") Integer userId,
            @Param("keyword") String keyword,
            @Param("categoryId") Integer categoryId);

    @Select("""
            <script>
            select distinct
                n.id as id,
                n.user_id as userId,
                n.title as title,
                n.content as content,
                n.rich_content as richContent,
                n.favorite as favorite,
                n.created_at as createdAt,
                n.updated_at as updatedAt
            from note n
            <if test="categoryId != null">
                inner join note_category nc on nc.note_id = n.id
            </if>
            where n.user_id = #{userId}
            <if test="keyword != null and keyword != ''">
                and (
                    n.title like concat('%', #{keyword}, '%')
                    or n.content like concat('%', #{keyword}, '%')
                )
            </if>
            <if test="categoryId != null">
                and nc.category_id = #{categoryId}
            </if>
            order by n.updated_at desc, n.id desc
            limit #{limit} offset #{offset}
            </script>
            """)
    List<NotebookNote> listByQuery(
            @Param("userId") Integer userId,
            @Param("keyword") String keyword,
            @Param("categoryId") Integer categoryId,
            @Param("offset") Integer offset,
            @Param("limit") Integer limit);
}
